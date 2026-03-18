/**
 * Phone verification — send OTP.
 *
 * POST /api/v1/phone/verify/send — Send OTP to user's phone via Twilio Verify
 *
 * Phone must be verified before SMS consent can be given (TCPA compliance).
 * Rate limiting: 60-second cooldown between sends, persisted in DB (not in-memory).
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

const VERIFY_COOLDOWN_MS = 60_000;

const sendOtpSchema = z.object({
  phone: phoneE164Schema,
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  // Check durable cooldown from DB
  const db = createUnscopedClient();
  const [user] = await db
    .select({ otpLastSentAt: users.otpLastSentAt })
    .from(users)
    .where(eq(users.id, userId));

  if (user?.otpLastSentAt) {
    const elapsed = Date.now() - user.otpLastSentAt.getTime();
    if (elapsed < VERIFY_COOLDOWN_MS) {
      return NextResponse.json(
        {
          error: 'Please wait before requesting another code',
          retryAfter: Math.ceil((VERIFY_COOLDOWN_MS - elapsed) / 1000),
        },
        { status: 429 },
      );
    }
  }

  const body = await req.json();

  const parsed = sendOtpSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid phone number', { fields: formatZodErrors(parsed.error) });
  }

  const { phone } = parsed.data;

  // Use Twilio Verify API to send OTP
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
      `https://verify.twilio.com/v2/Services/${verifySid}/Verifications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
        body: new URLSearchParams({
          To: phone,
          Channel: 'sms',
        }).toString(),
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error('[phone/verify/send] Twilio error:', errorBody.code, errorBody.message);
      return NextResponse.json(
        { error: 'Could not send verification code. Please try again.' },
        { status: 422 },
      );
    }

    // Persist cooldown timestamp in DB (durable across serverless instances)
    await db
      .update(users)
      .set({ otpLastSentAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));

    return NextResponse.json({ sent: true, phone: maskPhone(phone) });
  } catch {
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 },
    );
  }
});
