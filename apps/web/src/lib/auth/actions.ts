'use server';

/**
 * Server Actions for password reset.
 *
 * These are thin wrappers around the core logic in password-reset.ts,
 * exposed as Next.js Server Actions for use in client components.
 *
 * Both refuse under a support session. A Server Action POSTs to the PAGE path,
 * so middleware's read-only support-session block (gated on API paths) never
 * sees it — the check has to live here. The mobile Security page calls
 * `requestPasswordReset` from inside the authenticated app, which an operator
 * can reach while impersonating; credentials are never support's to touch.
 */

import { headers } from 'next/headers';
import { refuseUnderSupportSession } from '@/lib/support/support-scope';
import {
  requestPasswordReset as requestPasswordResetCore,
  updatePassword as updatePasswordCore,
  type ForgotPasswordResult,
  type ResetPasswordResult,
} from './password-reset';

export async function requestPasswordReset(
  email: string,
): Promise<ForgotPasswordResult> {
  refuseUnderSupportSession(await headers());
  return requestPasswordResetCore(email);
}

export async function updatePasswordAction(
  newPassword: string,
): Promise<ResetPasswordResult> {
  refuseUnderSupportSession(await headers());
  return updatePasswordCore(newPassword);
}
