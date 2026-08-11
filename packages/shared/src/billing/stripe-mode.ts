/**
 * Which Stripe mode a secret key belongs to.
 *
 * Test and live are disjoint object namespaces: a customer, subscription, price
 * or coupon id created in one is invisible to the other. Almost every
 * cross-environment Stripe fault in this codebase reduces to two surfaces
 * disagreeing about which mode they are in, so the check lives here — pure, with
 * no Stripe SDK dependency — and both the web app and the ops scripts import it
 * rather than each re-deriving the rule.
 */

/** Prefixes Stripe issues for secret and restricted keys, by mode. */
const LIVE_SECRET_PREFIXES = ['sk_live_', 'rk_live_'] as const;
const TEST_SECRET_PREFIXES = ['sk_test_', 'rk_test_'] as const;

/** Publishable keys are safe to expose and carry the same mode marker. */
const LIVE_PUBLISHABLE_PREFIX = 'pk_live_';
const TEST_PUBLISHABLE_PREFIX = 'pk_test_';

/**
 * `true` = live, `false` = test, `null` = UNKNOWN (unset, empty, or a prefix we
 * do not recognise).
 *
 * Callers MUST treat `null` as "do not gate". A prefix we failed to parse must
 * never start rejecting real payment traffic; the worst an unknown may do is
 * leave existing behaviour unchanged.
 */
export function stripeKeyLivemode(key: string | undefined | null): boolean | null {
  if (!key) return null;
  if (LIVE_SECRET_PREFIXES.some((p) => key.startsWith(p))) return true;
  if (TEST_SECRET_PREFIXES.some((p) => key.startsWith(p))) return false;
  return null;
}

/** Same contract as {@link stripeKeyLivemode}, for `pk_` publishable keys. */
export function stripePublishableKeyLivemode(key: string | undefined | null): boolean | null {
  if (!key) return null;
  if (key.startsWith(LIVE_PUBLISHABLE_PREFIX)) return true;
  if (key.startsWith(TEST_PUBLISHABLE_PREFIX)) return false;
  return null;
}

/** Human label for reports and logs. Never interpolate a key itself. */
export function describeLivemode(livemode: boolean | null): string {
  if (livemode === null) return 'unknown';
  return livemode ? 'live' : 'test';
}

/**
 * Redact a key for display: enough to tell two keys apart, never enough to use.
 * Keeps the mode-bearing prefix, drops the body, keeps the last 4.
 */
export function redactStripeKey(key: string | undefined | null): string {
  if (!key) return '(unset)';
  const prefix = /^([a-z]{2}_(?:live|test)_)/.exec(key)?.[1] ?? key.slice(0, 3);
  // Too short to have a meaningful tail — do not leak what little there is.
  if (key.length <= prefix.length + 4) return `${prefix}…`;
  return `${prefix}…${key.slice(-4)}`;
}
