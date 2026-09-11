/**
 * The URL the signup verification email links to.
 *
 * One builder, three callers — `lib/auth/signup.ts` (initial send and its
 * already-registered fallback) and `api/v1/auth/resend-verification` — because
 * the two halves of this had already drifted: `buildVerificationRedirectUrl`
 * existed twice, once using `getBaseUrl()` and once re-deriving the same
 * fallback chain by hand.
 *
 * This points at OUR domain rather than Supabase's `action_link`. See
 * `app/auth/verify-signup/route.ts` for why, and
 * `docs/audits/2026-09-11-signup-verification-deliverability.md` for the
 * measurement behind it.
 */
import { getBaseUrl } from '@/lib/utils/url';

/** Matches the `type` the token was generated with; the route allowlists both. */
export type VerificationLinkType = 'signup' | 'magiclink';

/**
 * Build the first-party verification link.
 *
 * `hashedToken` is a single-use, short-lived credential travelling in a query
 * parameter — the same shape invitations already use
 * (`/auth/accept-invite?token=…`). Checked rather than assumed: Sentry does not
 * retain it. `scrubBrowserEvent` runs `scrubUrl`/`scrubQueryString` over
 * `request.url` and `request.query_string`, and `scrubServerEvent` calls it
 * first, so query-parameter VALUES are redacted before an event is sent.
 */
export function buildVerificationLink(params: {
  hashedToken: string;
  signupRequestId: string;
  type: VerificationLinkType;
}): string {
  const url = new URL('/auth/verify-signup', getBaseUrl());
  url.searchParams.set('token_hash', params.hashedToken);
  url.searchParams.set('type', params.type);
  url.searchParams.set('signupRequestId', params.signupRequestId);
  return url.toString();
}

/**
 * Where Supabase should send the user if the emailed `action_link` is ever used
 * directly — links already delivered before this change, for instance.
 *
 * Still passed to `generateLink` so those remain functional: they redirect to
 * `/signup?...&verified=1`, which is exactly where the new route lands too.
 */
export function buildVerificationRedirectUrl(signupRequestId: string): string {
  const url = new URL('/signup', getBaseUrl());
  url.searchParams.set('signupRequestId', signupRequestId);
  url.searchParams.set('verified', '1');
  return url.toString();
}
