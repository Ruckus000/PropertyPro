/**
 * Password reset server-side logic.
 *
 * Key security invariant: non-existent emails follow the exact same code path
 * and timing as valid emails to prevent email enumeration attacks.
 * Supabase's `resetPasswordForEmail` already returns success for unknown emails,
 * so we rely on that behaviour and add an artificial delay to normalise timing
 * regardless of rate-limit branch or Supabase response time.
 */

import { createServerClient } from '@propertypro/db/supabase/server';
import {
  checkPasswordResetRateLimit,
  type RateLimitResult,
} from '../rate-limit/password-reset-limiter';

/** Minimum response time (ms) to normalise timing across all code paths. */
const MIN_RESPONSE_MS = 250;

export interface ForgotPasswordResult {
  success: boolean;
  message: string;
  rateLimitResult?: RateLimitResult;
}

export interface ResetPasswordResult {
  success: boolean;
  message: string;
}

/**
 * Request a password reset email.
 *
 * Always returns a generic success message to the caller regardless of whether
 * the email exists, to prevent email enumeration.
 */
export async function requestPasswordReset(
  email: string,
): Promise<ForgotPasswordResult> {
  const start = Date.now();

  try {
    const normalisedEmail = email.toLowerCase().trim();

    // Rate-limit check — applied before any Supabase call
    const rateLimitResult = checkPasswordResetRateLimit(normalisedEmail);

    if (!rateLimitResult.allowed) {
      // Still wait to normalise timing
      await enforceMinResponseTime(start);
      return {
        success: false,
        message: 'Too many reset requests. Please try again later.',
        rateLimitResult,
      };
    }

    // Call Supabase — returns success even for non-existent emails
    const supabase = await createServerClient();
    const redirectTo = `${getBaseUrl()}/auth/reset-password`;

    await supabase.auth.resetPasswordForEmail(normalisedEmail, {
      redirectTo,
    });

    await enforceMinResponseTime(start);

    return {
      success: true,
      message:
        'If an account with that email exists, you will receive a password reset link shortly.',
    };
  } catch {
    // On any unexpected error, still return the generic message
    // to avoid leaking information via error differences.
    await enforceMinResponseTime(start);
    return {
      success: true,
      message:
        'If an account with that email exists, you will receive a password reset link shortly.',
    };
  }
}

/**
 * Update the user's password using a valid session from the reset link.
 *
 * The reset link redirects to /auth/reset-password with a Supabase auth code
 * in the URL fragment. The client exchanges this code for a session, then
 * calls this function to set the new password.
 */
export async function updatePassword(
  newPassword: string,
): Promise<ResetPasswordResult> {
  try {
    const supabase = await createServerClient();

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      // Token expired or invalid session
      if (
        error.message.includes('expired') ||
        error.message.includes('invalid')
      ) {
        return {
          success: false,
          message:
            'This reset link has expired. Please request a new password reset.',
        };
      }
      return {
        success: false,
        message: 'Failed to update password. Please try again.',
      };
    }

    return {
      success: true,
      message: 'Your password has been updated successfully.',
    };
  } catch {
    return {
      success: false,
      message: 'An unexpected error occurred. Please try again.',
    };
  }
}

/**
 * Enforce a minimum response time to prevent timing side-channels.
 */
async function enforceMinResponseTime(startMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  const remaining = MIN_RESPONSE_MS - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

function getBaseUrl(): string {
  // Server-side: use NEXT_PUBLIC_APP_URL or VERCEL_URL, fall back to localhost
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

/** Exported for testing */
export const _testInternals = { MIN_RESPONSE_MS, enforceMinResponseTime, getBaseUrl } as const;
