/**
 * POST /api/v1/auth/resend-verification
 *
 * Re-sends the signup verification email for a pending signup.
 * Requires only the signupRequestId — the auth user and email
 * are looked up from the pendingSignups row.
 *
 * Security: UUID v4 entropy (2^122) makes brute-force impractical.
 * Rate limiting on /signup paths (10 req/min per IP) limits abuse.
 * 2-minute cooldown prevents email bombing.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { pendingSignups } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { sendEmail } from '@propertypro/email';
import { createElement } from 'react';
import { SignupVerificationEmail } from '@propertypro/email';

const VERIFICATION_EMAIL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

const resendSchema = z.object({
  signupRequestId: z.string().min(1, 'signupRequestId is required').max(128).trim(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    throw new ValidationError('Invalid JSON in request body');
  }

  const parsed = resendSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join('; ') || 'signupRequestId is required',
    );
  }

  const { signupRequestId } = parsed.data;
  const db = createUnscopedClient();

  const rows = await db
    .select({
      id: pendingSignups.id,
      signupRequestId: pendingSignups.signupRequestId,
      authUserId: pendingSignups.authUserId,
      email: pendingSignups.email,
      primaryContactName: pendingSignups.primaryContactName,
      communityName: pendingSignups.communityName,
      status: pendingSignups.status,
      expiresAt: pendingSignups.expiresAt,
      verificationEmailSentAt: pendingSignups.verificationEmailSentAt,
    })
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, signupRequestId))
    .limit(1);

  const signup = rows[0];

  if (!signup) {
    return NextResponse.json(
      { error: { message: 'Signup request not found or has expired.' } },
      { status: 404 },
    );
  }

  // Check expiry
  if (signup.expiresAt && new Date(signup.expiresAt) < new Date()) {
    return NextResponse.json(
      { error: { message: 'This signup request has expired. Please start a new signup.' } },
      { status: 404 },
    );
  }

  // Already verified — tell client to redirect to checkout
  if (signup.status === 'email_verified' || signup.status === 'checkout_started') {
    return NextResponse.json(
      { data: { alreadyVerified: true, signupRequestId: signup.signupRequestId } },
      { status: 409 },
    );
  }

  if (signup.status !== 'pending_verification') {
    return NextResponse.json(
      { error: { message: 'This signup cannot receive verification emails.' } },
      { status: 400 },
    );
  }

  // Check cooldown
  if (signup.verificationEmailSentAt) {
    const elapsed = Date.now() - new Date(signup.verificationEmailSentAt).getTime();
    const remaining = VERIFICATION_EMAIL_COOLDOWN_MS - elapsed;
    if (remaining > 0) {
      return NextResponse.json(
        {
          error: {
            message: 'Verification email was sent recently. Please wait before requesting another.',
            cooldownRemainingSeconds: Math.ceil(remaining / 1000),
          },
        },
        { status: 429 },
      );
    }
  }

  // Auth user must exist (linked during initial signup)
  if (!signup.authUserId) {
    console.error(JSON.stringify({
      event: 'resend_verification.no_auth_user',
      signupRequestId: signup.signupRequestId,
    }));
    return NextResponse.json(
      { error: { message: 'Unable to resend verification. Please try signing up again.' } },
      { status: 400 },
    );
  }

  // Generate a fresh verification link
  const admin = createAdminClient();
  const verificationRedirectUrl = buildVerificationRedirectUrl(signup.signupRequestId);

  const linkResult = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: signup.email,
    options: {
      redirectTo: verificationRedirectUrl,
      data: {
        signup_request_id: signup.signupRequestId,
      },
    },
  });

  const actionLink = linkResult.data?.properties?.action_link;
  if (linkResult.error || !actionLink) {
    console.error(JSON.stringify({
      event: 'resend_verification.link_generation_failed',
      signupRequestId: signup.signupRequestId,
      error: linkResult.error?.message ?? 'No action link returned',
    }));
    return NextResponse.json(
      { error: { message: 'Unable to generate verification link. Please try again.' } },
      { status: 500 },
    );
  }

  // Send the email
  let messageId: string;
  try {
    const result = await sendEmail({
      to: signup.email,
      subject: 'Verify your email to continue your PropertyPro signup',
      category: 'transactional',
      react: createElement(SignupVerificationEmail, {
        branding: { communityName: 'PropertyPro Florida' },
        primaryContactName: signup.primaryContactName,
        communityName: signup.communityName,
        verificationLink: actionLink,
      }),
    });
    messageId = result.id;
  } catch (emailError) {
    console.error(JSON.stringify({
      event: 'resend_verification.email_failed',
      signupRequestId: signup.signupRequestId,
      error: emailError instanceof Error ? emailError.message : String(emailError),
    }));
    return NextResponse.json(
      { error: { message: 'Unable to send verification email. Please try again.' } },
      { status: 500 },
    );
  }

  // Update the sent timestamp
  await db
    .update(pendingSignups)
    .set({
      verificationEmailSentAt: new Date(),
      verificationEmailId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(pendingSignups.id, signup.id));

  console.info(JSON.stringify({
    event: 'resend_verification.sent',
    signupRequestId: signup.signupRequestId,
  }));

  return NextResponse.json({
    data: { sent: true, cooldownSeconds: VERIFICATION_EMAIL_COOLDOWN_MS / 1000 },
  });
});

function buildVerificationRedirectUrl(signupRequestId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const url = new URL('/signup', baseUrl);
  url.searchParams.set('signupRequestId', signupRequestId);
  url.searchParams.set('verified', '1');
  return url.toString();
}
