/**
 * Phone verification — confirm OTP.
 *
 * POST /api/v1/phone/verify/confirm — Verify OTP and set phoneVerifiedAt
 *
 * On success, updates the user's phone and phoneVerifiedAt in the users table.
 * Rate limiting: 5 failed attempts → 15 min lockout, persisted in DB (not in-memory).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { isSmsDispatchGloballyEnabled } from '@/lib/sms/dispatch-flag';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { phoneE164Schema, maskPhone } from '@/lib/utils/phone';
import {
  getUserOtpState,
  markOtpFailed,
  markPhoneVerified,
} from '@/lib/services/phone-verification-service';
import { getUserProfileSnapshot } from '@/lib/services/user-profile-service';
import { getSupportScope } from '@/lib/support/support-scope';
import {
  isSupportAuditError,
  maskPhoneToLast4,
  recordSupportAction,
} from '@/lib/support/support-audit';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;

const confirmOtpSchema = z.object({
  phone: phoneE164Schema,
  code: z.string().min(4).max(10),
});

// route-gate: self-scoped — confirms the caller's own phone number with their OTP
export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  // Check durable lockout from DB
  const { otpFailedAttempts, otpLockedUntil } = await getUserOtpState(userId);

  const now = Date.now();
  if (otpLockedUntil && otpLockedUntil.getTime() > now) {
    return NextResponse.json(
      {
        error: 'Too many attempts. Try again later.',
        retryAfter: Math.ceil((otpLockedUntil.getTime() - now) / 1000),
      },
      { status: 429 },
    );
  }

  const body = await req.json();

  const parsed = confirmOtpSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid verification request', { fields: formatZodErrors(parsed.error) });
  }

  const { phone, code } = parsed.data;

  // Use Twilio Verify API to check OTP
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

  // Global SMS kill switch. These routes call Twilio Verify DIRECTLY rather than
  // going through sms-service, so the service-level floor does not cover them —
  // and they are userId-scoped with no communityId, so the per-community
  // `smsDispatchEnabled` flag cannot reach them either. The env floor is the only
  // gate available here. Reuses the existing 503 shape the client already
  // handles. See @/lib/sms/common and audit F-10.
  if (!isSmsDispatchGloballyEnabled() || !accountSid || !authToken || !verifySid) {
    return NextResponse.json(
      { error: 'SMS verification is not configured' },
      { status: 503 },
    );
  }

  // Support session: record the check BEFORE the code is sent to Twilio, fail
  // closed. Recording it first (not after a wrong code) keeps the lockout
  // independent of the audit write: if this insert fails, no guess is checked;
  // once it succeeds, a wrong code always bumps the counter below. The code
  // itself is never logged; the number checked is the row's masked `target`.
  // `after` omits otpFailedAttempts: the outcome decides it (bumped on a
  // wrong code; reset by markPhoneVerified on a right one).
  await recordSupportAction(req.headers, {
    event: 'support_phone_verification_attempted',
    targetUserId: userId,
    changedFields: ['otpFailedAttempts'],
    before: { otpFailedAttempts: otpFailedAttempts ?? 0 },
    target: { phone: maskPhoneToLast4(phone) },
  });

  try {
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${verifySid}/VerificationCheck`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
        body: new URLSearchParams({
          To: phone,
          Code: code,
        }).toString(),
      },
    );

    const data = await response.json();

    if (!response.ok || data.status !== 'approved') {
      // Increment failed attempts in DB (durable across serverless instances)
      const currentCount = (otpFailedAttempts ?? 0) + 1;
      const lockoutUntil =
        currentCount >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : undefined;

      if (lockoutUntil) {
        await markOtpFailed(userId, {
          newAttemptCount: currentCount,
          lockoutUntil,
        });
      } else {
        await markOtpFailed(userId, { newAttemptCount: currentCount });
      }

      return NextResponse.json(
        { error: 'Invalid verification code', verified: false },
        { status: 400 },
      );
    }

    // Support session: record the verification BEFORE persisting it, fail
    // closed — a throw skips markPhoneVerified, and the catch below rethrows
    // it so the client sees the audit refusal (SUPPORT_AUDIT_FAILED / 403),
    // not the generic "Verification check failed". Phones masked to the last
    // four digits; never the code.
    if (getSupportScope(req.headers) !== null) {
      const current = await getUserProfileSnapshot(userId);
      // `phone` is a changed field only when the confirmed number differs from
      // the stored one; phoneVerifiedAt always changes (stamped as now by
      // markPhoneVerified, so omitted from `after`). The number confirmed is
      // the masked `target` either way.
      const phoneChanges = current.phone !== phone;
      await recordSupportAction(req.headers, {
        event: 'support_phone_verified',
        targetUserId: userId,
        changedFields: phoneChanges ? ['phone', 'phoneVerifiedAt'] : ['phoneVerifiedAt'],
        before: {
          ...(phoneChanges ? { phone: maskPhoneToLast4(current.phone) } : {}),
          phoneVerifiedAt: current.phoneVerifiedAt?.toISOString() ?? null,
        },
        after: phoneChanges ? { phone: maskPhoneToLast4(phone) } : {},
        target: { phone: maskPhoneToLast4(phone) },
      });
    }

    // Update user's phone, phoneVerifiedAt, and reset OTP rate-limit state
    await markPhoneVerified(userId, phone);

    return NextResponse.json({ verified: true, phone: maskPhone(phone) });
  } catch (error) {
    if (isSupportAuditError(error)) throw error;
    return NextResponse.json(
      { error: 'Verification check failed' },
      { status: 500 },
    );
  }
});
