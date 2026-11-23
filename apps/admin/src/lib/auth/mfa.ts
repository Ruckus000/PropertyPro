/**
 * Two-factor (TOTP) gate for the platform-admin console (ponytail audit #14).
 *
 * A platform admin controls every tenant, live Stripe billing and support
 * impersonation, so one password is not enough. Supabase's built-in TOTP
 * raises a session to `aal2`; the middleware and `requirePlatformAdmin` both
 * refuse anything less. `/auth/mfa` (public under `/auth/`) is where an `aal1`
 * session enrols a factor or answers a challenge.
 */

/** Where an `aal1` session is sent to enrol or verify. */
export const MFA_PATH = '/auth/mfa';

export const MFA_REQUIRED_CODE = 'MFA_REQUIRED';

interface ClaimsReader {
  auth: {
    getClaims(): Promise<{
      data: { claims: { aal?: unknown; sub?: unknown } } | null;
      error: unknown;
    }>;
  };
}

/**
 * The user id of an `aal2` session, or null for anything less.
 *
 * `getClaims()` verifies the JWT (locally against the JWKS, or via the Auth
 * server on a legacy shared secret) before returning its claims, so neither
 * the level nor the subject can be forged by editing the cookie. Any error
 * reads as "no aal2 session".
 */
export async function aal2SessionSubject(supabase: ClaimsReader): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || data?.claims?.aal !== 'aal2') return null;
  const sub = data.claims.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

/** True only when the session's VERIFIED access token says `aal2`. */
export async function sessionIsAal2(supabase: ClaimsReader): Promise<boolean> {
  const { data, error } = await supabase.auth.getClaims();
  return !error && data?.claims?.aal === 'aal2';
}
