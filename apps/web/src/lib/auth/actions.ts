'use server';

/**
 * Server Actions for password reset.
 *
 * These are thin wrappers around the core logic in password-reset.ts,
 * exposed as Next.js Server Actions for use in client components.
 */

import {
  requestPasswordReset as requestPasswordResetCore,
  updatePassword as updatePasswordCore,
  type ForgotPasswordResult,
  type ResetPasswordResult,
} from './password-reset';

export async function requestPasswordReset(
  email: string,
): Promise<ForgotPasswordResult> {
  return requestPasswordResetCore(email);
}

export async function updatePasswordAction(
  newPassword: string,
): Promise<ResetPasswordResult> {
  return updatePasswordCore(newPassword);
}
