/**
 * POST /api/v1/auth/confirm-verification
 *
 * Transitions a pending_signups row from `pending_verification` to `email_verified`
 * after confirming the Supabase auth user has a verified email.
 *
 * This is token-authenticated (no session required) because the user arrives
 * from a Supabase email-verification redirect before a session is established.
 *
 * O-01 fix: The signup flow previously never wrote the `email_verified` status,
 * blocking checkout (which guards on `status === 'email_verified'`).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import {
  getPendingSignupForVerification,
  getSupabaseEmailVerificationStatus,
  markPendingSignupEmailVerifiedIfPending,
} from '@/lib/services/provisioning-service';

const confirmVerificationSchema = z.object({
  signupRequestId: z.string().min(1).max(128).trim(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    throw new ValidationError('Invalid JSON in request body');
  }

  const parsed = confirmVerificationSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join('; ') || 'signupRequestId is required',
    );
  }

  const body = parsed.data;

  const signup = await getPendingSignupForVerification(body.signupRequestId);

  if (!signup) {
    throw new ValidationError('Signup request not found');
  }

  // Already verified — return success idempotently
  if (signup.status === 'email_verified' || signup.status === 'checkout_started') {
    return NextResponse.json({
      data: { success: true, signupRequestId: signup.signupRequestId },
    });
  }

  if (signup.status !== 'pending_verification') {
    throw new ValidationError(
      `Cannot confirm verification from status "${signup.status}"`,
    );
  }

  // Check expiry
  if (signup.expiresAt && new Date(signup.expiresAt) < new Date()) {
    throw new ValidationError('This signup request has expired. Please start a new signup.');
  }

  // Verify the auth user actually confirmed their email in Supabase
  if (!signup.authUserId) {
    throw new ValidationError(
      'Signup is not yet linked to an auth account. Please check your email for the verification link.',
    );
  }

  const verification = await getSupabaseEmailVerificationStatus(signup.authUserId);
  if (!verification.ok) {
    console.error(JSON.stringify({
      event: 'confirm_verification.auth_lookup_failed',
      signupRequestId: signup.signupRequestId,
      authUserId: signup.authUserId,
      error: verification.error,
    }));
    throw new ValidationError('Unable to verify email status. Please try again.');
  }

  if (!verification.emailConfirmedAt) {
    throw new ValidationError(
      'Email has not been verified yet. Please click the verification link in your email.',
    );
  }

  // Transition to email_verified with status guard to prevent TOCTOU race.
  // On race (0 rows updated), the service re-reads the current status so we
  // can return success when another concurrent request already advanced the
  // row to email_verified or checkout_started.
  const transition = await markPendingSignupEmailVerifiedIfPending(body.signupRequestId);

  if (!transition.updated) {
    if (
      transition.currentStatus === 'email_verified' ||
      transition.currentStatus === 'checkout_started'
    ) {
      return NextResponse.json({
        data: { success: true, signupRequestId: signup.signupRequestId },
      });
    }

    throw new ValidationError(
      `Status transition failed — current status is "${transition.currentStatus ?? 'unknown'}"`,
    );
  }

  console.info(JSON.stringify({
    event: 'signup.email_verified',
    signupRequestId: signup.signupRequestId,
  }));

  return NextResponse.json({
    data: { success: true, signupRequestId: signup.signupRequestId },
  });
});
