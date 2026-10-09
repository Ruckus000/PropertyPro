/**
 * The URL the signup sign-in email links to (`signup-email-first.ts`).
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
  type: VerificationLinkType;
  /** SHA-256 of the requesting browser's nonce (signup-binding.ts); the route requires it. */
  binding: string;
}): string {
  const url = new URL('/auth/verify-signup', getBaseUrl());
  url.searchParams.set('token_hash', params.hashedToken);
  url.searchParams.set('type', params.type);
  url.searchParams.set('b', params.binding);
  return url.toString();
}
