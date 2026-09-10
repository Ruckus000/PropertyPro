/**
 * How long a pending signup holds its candidate subdomain before the sweep may
 * release it.
 *
 * Deliberately its own module with no imports, for the same reason
 * `lib/db/unique-constraint-error.ts` is: the obvious home is `lib/auth/signup.ts`,
 * but that file pulls in `@propertypro/email`, the Supabase admin client and the
 * DB. Importing one number from it would drag that whole graph into every
 * billing test.
 *
 * TWO producers must agree on this value, and until 2026-09-10 only one of them
 * used it at all:
 *
 *   - `upsertPendingSignup` (lib/auth/signup.ts) — the public signup form.
 *   - `createPendingAddToGroupSignup` (lib/billing/billing-group-service.ts) —
 *     a PM adding a community to an existing billing group.
 *
 * The second one omitted `expires_at` entirely, which is not a cosmetic
 * difference. A row with `expires_at IS NULL` and a status inside
 * `pending_signups_candidate_slug_active_unique` is invisible to
 * `expireStalePendingSignups` (which requires `isNotNull`, deliberately) and is
 * treated as permanently blocking by `checkSignupSubdomainAvailability` (whose
 * predicate is `expiresAt IS NULL OR expiresAt > now()`). So an abandoned
 * add-to-group checkout reserved its subdomain forever, with no automated path
 * that could ever release it.
 *
 * If this value ever needs to differ per producer, split it into two named
 * constants here rather than letting one caller inline a literal — the invariant
 * that matters is that every producer sets it to SOMETHING.
 */
export const SIGNUP_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
