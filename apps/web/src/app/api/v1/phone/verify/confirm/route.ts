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
import { users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { phoneE164Schema, maskPhone } from '@/lib/utils/phone';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;

const confirmOtpSchema = z.object({
  phone: phoneE164Schema,
  code: z.string().min(4).max(10),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const db = createUnscopedClient();

  // Check durable lockout from DB
  const [user] = await db
    .select({
      otpFailedAttempts: users.otpFailedAttempts,
      otpLockedUntil: users.otpLockedUntil,
    })
    .from(users)
    .where(eq(users.id, userId));

  const now = Date.now();
  if (user?.otpLockedUntil && user.otpLockedUntil.getTime() > now) {
    return NextResponse.json(
      {
        error: 'Too many attempts. Try again later.',
        retryAfter: Math.ceil((user.otpLockedUntil.getTime() - now) / 1000),
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

  if (!accountSid || !authToken || !verifySid) {
    return NextResponse.json(
      { error: 'SMS verification is not configured' },
      { status: 503 },
    );
  }

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
      const currentCount = (user?.otpFailedAttempts ?? 0) + 1;
      if (currentCount >= MAX_ATTEMPTS) {
        await db
          .update(users)
          .set({
            otpFailedAttempts: 0,
            otpLockedUntil: new Date(Date.now() + LOCKOUT_MS),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      } else {
        await db
          .update(users)
          .set({ otpFailedAttempts: currentCount, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      return NextResponse.json(
        { error: 'Invalid verification code', verified: false },
        { status: 400 },
      );
    }

    // Update user's phone, phoneVerifiedAt, and reset OTP rate-limit state
    await db
      .update(users)
      .set({
        phone,
        phoneVerifiedAt: new Date(),
        otpFailedAttempts: 0,
        otpLockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({ verified: true, phone: maskPhone(phone) });
  } catch {
    return NextResponse.json(
      { error: 'Verification check failed' },
      { status: 500 },
    );
  }
});
