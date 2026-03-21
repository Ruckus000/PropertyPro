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
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { pendingSignups } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = (await req.json()) as { signupRequestId?: string };

  if (!body.signupRequestId || typeof body.signupRequestId !== 'string') {
    throw new ValidationError('signupRequestId is required');
  }

  const db = createUnscopedClient();

  const rows = await db
    .select({
      id: pendingSignups.id,
      signupRequestId: pendingSignups.signupRequestId,
      authUserId: pendingSignups.authUserId,
      status: pendingSignups.status,
      expiresAt: pendingSignups.expiresAt,
    })
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, body.signupRequestId))
    .limit(1);

  const signup = rows[0];

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

  const admin = createAdminClient();
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(
    signup.authUserId,
  );

  if (authError || !authUser?.user) {
    console.error(JSON.stringify({
      event: 'confirm_verification.auth_lookup_failed',
      signupRequestId: signup.signupRequestId,
      authUserId: signup.authUserId,
      error: authError?.message ?? 'User not found',
    }));
    throw new ValidationError('Unable to verify email status. Please try again.');
  }

  if (!authUser.user.email_confirmed_at) {
    throw new ValidationError(
      'Email has not been verified yet. Please click the verification link in your email.',
    );
  }

  // Transition to email_verified
  await db
    .update(pendingSignups)
    .set({
      status: 'email_verified',
      updatedAt: new Date(),
    })
    .where(eq(pendingSignups.signupRequestId, body.signupRequestId));

  console.info(JSON.stringify({
    event: 'signup.email_verified',
    signupRequestId: signup.signupRequestId,
  }));

  return NextResponse.json({
    data: { success: true, signupRequestId: signup.signupRequestId },
  });
});
