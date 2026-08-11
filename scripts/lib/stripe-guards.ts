/**
 * Refusals shared by the Stripe ops scripts.
 *
 * These are assertions, not helpers with options: each one either passes or
 * throws. None of them takes a `force` / `--yes` parameter, because the only
 * situation in which someone wants to bypass "this key is not the mode you said"
 * is the situation the guard exists to catch.
 *
 * The mode rule itself comes from `@propertypro/shared` — one implementation,
 * shared with the Stripe webhook's mode guard.
 */
import { describeLivemode, redactStripeKey, stripeKeyLivemode } from '@propertypro/shared';

/**
 * Assert `key` is a usable secret key in the expected mode.
 *
 * An UNKNOWN prefix is a failure here, unlike in the webhook where unknown means
 * "do not gate". The asymmetry is deliberate: the webhook's job is to keep
 * serving traffic, and a script's job is to refuse to create billing objects it
 * cannot vouch for.
 */
export function assertKeyMode(
  key: string | undefined,
  expectLive: boolean,
  opts: { because: string },
): asserts key is string {
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set. Aborting.');

  const actual = stripeKeyLivemode(key);
  const expected = describeLivemode(expectLive);

  if (actual === null) {
    throw new Error(
      `REFUSING TO RUN — STRIPE_SECRET_KEY (${redactStripeKey(key)}) has an unrecognised prefix, ` +
        `so its Stripe mode cannot be determined. Expected a ${expected}-mode key. ${opts.because}`,
    );
  }

  if (actual !== expectLive) {
    throw new Error(
      `REFUSING TO RUN — STRIPE_SECRET_KEY (${redactStripeKey(key)}) is a ` +
        `${describeLivemode(actual)}-mode key, but this script requires a ${expected}-mode key. ` +
        opts.because,
    );
  }
}

const LOOPBACK_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '0.0.0.0',
  'host.docker.internal',
];

/** Extract the bare host from a postgres URL, without pulling in a URL parser. */
export function databaseHost(url: string): string {
  return url
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    .replace(/^[^@/]*@/, '')
    .replace(/[/?].*$/, '')
    .replace(/:\d+$/, '');
}

export function isLoopbackDatabase(url: string | undefined): boolean {
  if (!url) return false;
  return LOOPBACK_HOSTS.includes(databaseHost(url));
}

/** Assert `DATABASE_URL` points at a local database. */
export function assertLoopbackDatabase(
  url: string | undefined,
  opts: { because: string },
): asserts url is string {
  if (!url) throw new Error('DATABASE_URL is not set. Aborting.');
  if (!isLoopbackDatabase(url)) {
    throw new Error(
      `REFUSING TO RUN — DATABASE_URL host "${databaseHost(url)}" is not loopback. ${opts.because}`,
    );
  }
}

/**
 * Assert an explicit acknowledgement flag is present.
 *
 * Used where the operation is correct but irreversible — creating real billing
 * objects, deleting rows. The flag is spelled out rather than `--force` so that
 * it cannot be typed by muscle memory or copied from an unrelated command.
 */
export function assertAcknowledged(argv: string[], flag: string, opts: { because: string }): void {
  if (!argv.includes(flag)) {
    throw new Error(`REFUSING TO RUN — ${opts.because}\nRe-run with ${flag} if that is intended.`);
  }
}
