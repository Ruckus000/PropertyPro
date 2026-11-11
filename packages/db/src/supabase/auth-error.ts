/**
 * Which Supabase auth errors may show their own message to a person.
 *
 * supabase-js RETURNS (does not throw) a network failure from `signInWithPassword`
 * and the MFA calls, as an `AuthRetryableFetchError` whose message is the
 * browser's raw fetch text. Safari appends the request host to it
 * ("Load failed (<ref>.supabase.co)"), so rendering `error.message` verbatim
 * shows the project host on the sign-in screen.
 *
 * Only an `AuthApiError` was written by the Supabase server, so only that one
 * is shown, and only below 500: a GoTrue 5xx body can carry internal detail
 * ("Database error querying schema"). Everything else falls back to the
 * caller's own copy. Other auth-js classes (e.g. `AuthWeakPasswordError`, which
 * only `updateUser`/`signUp` return) fall back too, so a caller that can receive
 * one must handle it before calling this.
 *
 * ponytail: nothing stops a new auth surface rendering `error.message` raw.
 * Trigger: a raw auth-error render appears in review.
 *
 * @module supabase/auth-error
 */
import { isAuthApiError, isAuthSessionMissingError, type AuthError } from '@supabase/supabase-js';

const SESSION_EXPIRED = 'Your session has expired. Sign out and sign in again.';

export function getSafeAuthErrorMessage(error: AuthError, fallback: string): string {
  // A revoked session is not a network problem: retrying can never work.
  if (isAuthSessionMissingError(error)) return SESSION_EXPIRED;
  return isAuthApiError(error) && error.status < 500 ? error.message : fallback;
}
