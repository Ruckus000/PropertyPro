/**
 * Phone verification — confirm OTP.
 *
 * POST /api/v1/phone/verify/confirm — Verify OTP and set phoneVerifiedAt
 *
 * On success, updates the user's phone and phoneVerifiedAt in the users table.
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
import { phoneE164Schema } from '@/lib/utils/phone';

const confirmOtpSchema = z.object({
  phone: phoneE164Schema,
  code: z.string().min(4).max(10),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
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
      return NextResponse.json(
        { error: 'Invalid verification code', verified: false },
        { status: 422 },
      );
    }

    // Update user's phone and phoneVerifiedAt
    // Uses unscoped client since users table is not community-scoped
    const db = createUnscopedClient();
    await db
      .update(users)
      .set({
        phone,
        phoneVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({ verified: true, phone });
  } catch {
    return NextResponse.json(
      { error: 'Verification check failed' },
      { status: 500 },
    );
  }
});
