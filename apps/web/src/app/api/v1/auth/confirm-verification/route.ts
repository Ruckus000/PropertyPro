/**
 * POST /api/v1/auth/confirm-verification
 *
 * Transitions a pending_signups row from `pending_verification` to `email_verified`
 * after confirming the Supabase auth user has a verified email.
 *
 * This is token-authenticated (no session required) because the user arrives
 * from a Supabase email-verification redirect before a session is established.
 *
 * Plan A1 drain #157. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import {
  getPendingSignupForVerification,
  getSupabaseEmailVerificationStatus,
  markPendingSignupEmailVerifiedIfPending,
} from '@/lib/services/provisioning-service';
import { confirmVerificationPostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(confirmVerificationPostContract, async ({ body }) => {
    const signup = await getPendingSignupForVerification(body.signupRequestId);

    if (!signup) {
      throw new ValidationError('Signup request not found');
    }

    if (signup.status === 'email_verified' || signup.status === 'checkout_started') {
      return { success: true as const, signupRequestId: signup.signupRequestId };
    }

    if (signup.status !== 'pending_verification') {
      throw new ValidationError(
        `Cannot confirm verification from status "${signup.status}"`,
      );
    }

    if (signup.expiresAt && new Date(signup.expiresAt) < new Date()) {
      throw new ValidationError('This signup request has expired. Please start a new signup.');
    }

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

    const transition = await markPendingSignupEmailVerifiedIfPending(body.signupRequestId);

    if (!transition.updated) {
      if (
        transition.currentStatus === 'email_verified' ||
        transition.currentStatus === 'checkout_started'
      ) {
        return { success: true as const, signupRequestId: signup.signupRequestId };
      }

      throw new ValidationError(
        `Status transition failed — current status is "${transition.currentStatus ?? 'unknown'}"`,
      );
    }

    console.info(JSON.stringify({
      event: 'signup.email_verified',
      signupRequestId: signup.signupRequestId,
    }));

    return { success: true as const, signupRequestId: signup.signupRequestId };
  }),
);
