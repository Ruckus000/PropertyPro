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
 *
 * `requestPasswordReset` also carries its own per-IP limit, for the same
 * reason: on `/mobile/settings/security` the POST is a `page` request to
 * middleware, so the auth tier's distributed 10/min/IP limit never applies.
 */

import { headers } from 'next/headers';
import { consumeKeyedRateLimit } from '@/lib/api/keyed-rate-limit';
import { extractClientIp } from '@/lib/middleware/rate-limit-config';
import { refuseUnderSupportSession } from '@/lib/support/support-scope';
import {
  PASSWORD_RESET_RATE_LIMITED_MESSAGE,
  requestPasswordReset as requestPasswordResetCore,
  updatePassword as updatePasswordCore,
  type ForgotPasswordResult,
  type ResetPasswordResult,
} from './password-reset';

export async function requestPasswordReset(
  email: string,
): Promise<ForgotPasswordResult> {
  const requestHeaders = await headers();
  refuseUnderSupportSession(requestHeaders);
  // The auth tier's limit (10/min/IP), distributed, whatever page bundles this.
  const ip = extractClientIp({ headers: requestHeaders });
  const perIp = await consumeKeyedRateLimit(`pwreset:ip:${ip}`, 10, 60_000);
  if (!perIp.allowed) {
    return { success: false, message: PASSWORD_RESET_RATE_LIMITED_MESSAGE };
  }
  return requestPasswordResetCore(email);
}

export async function updatePasswordAction(
  newPassword: string,
): Promise<ResetPasswordResult> {
  refuseUnderSupportSession(await headers());
  return updatePasswordCore(newPassword);
}
