/**
 * The Health board's own instance of the shared TTL cache.
 *
 * ## The cost this removes
 *
 * `getHealthReport()` performs, in production, six outbound probes plus three
 * privileged Supabase reads: `${WEB_APP_ORIGIN}/api/health`, the admin app's own
 * `/api/health`, `https://api.resend.com/domains`, `stripe.balance.retrieve()`,
 * a Sentry REST call, and reads of `cron_runs`, `stripe_webhook_events` and a
 * liveness ping.
 *
 * The health provider is first in `buildDefaultProviders`, and `getShellSignals()` is
 * awaited by the `(console)` layout — so uncached that whole set ran on EVERY
 * console page navigation, and again on every 60-second poll of
 * `/api/admin/shell/signals` for as long as any tab stayed open. `React.cache()`
 * on `getShellSignals` dedupes only WITHIN one request, so it does not touch
 * either axis. Two consequences, and the second is the one an operator feels:
 * roughly sixty Resend, sixty Sentry and sixty Stripe calls per hour per open
 * tab with nobody looking at the Health page, and up to `PROBE_TIMEOUT_MS`
 * (4 s) added to the render of every page in the console whenever one
 * dependency is slow.
 *
 * `billing-cache.ts` had already made exactly this argument and solved it for
 * the billing signal. The health signal's per-render cost is strictly higher.
 *
 * ## Why sixty seconds, deliberately
 *
 * The TTL is chosen against the thing it could mislead: the shell already
 * refreshes these signals on a `SIGNAL_POLL_MS = 60_000` interval, so one minute
 * is the resolution the badge and tray have ever promised. A TTL at that same
 * interval therefore cannot make the board staler than the UI's own refresh
 * cadence, while collapsing two other costs entirely — every page navigation
 * between polls becomes free, and N open tabs (and N concurrent operators)
 * collapse to one probe set per minute per process instead of N.
 *
 * Longer would be cheaper and would start lying: a badge that still reads zero
 * two minutes into an outage is worse than no badge. Shorter would buy freshness
 * the UI cannot display, since nothing re-renders between polls.
 *
 * ## What is NOT cached, and why
 *
 * Only the shell-signal path. Both surfaces an operator opens ON PURPOSE go
 * straight to `getHealthReport()`:
 *
 *  - `/health` (the board) — it is opened precisely to take a fresh reading,
 *    and it passes its own `adminOrigin`, so it is a different report anyway.
 *  - `GET /api/admin/health` — this is the client-side refresh. A manual refresh
 *    that returned a cached answer is not a refresh; an operator pressing it
 *    during an outage is asking the question again and must get a new answer.
 *    It is `super_admin`-gated and deliberately rate-limited by nothing but the
 *    operator's own patience.
 *
 * So there is no invalidation hook here and there is not meant to be one: the
 * only writer of health state is production itself, and the TTL is the whole
 * freshness policy.
 *
 * @module lib/server/health-cache
 */
import { createTtlCache } from './ttl-cache';

/** One minute — matches `SIGNAL_POLL_MS`. See the docblock for why. */
export const HEALTH_CACHE_TTL_MS = 60_000;

/** The single key: the whole report, with default deps and no request origin. */
export const HEALTH_SIGNAL_CACHE_KEY = 'signal-report';

const healthCache = createTtlCache(HEALTH_CACHE_TTL_MS);

/**
 * Serve the shell signal's health report from cache, or load it.
 *
 * Separate instance from billing's: `invalidateBillingCache()` fires after every
 * money action, and a Stripe plan change is not a reason to re-probe Resend.
 */
export async function withHealthCache<T>(load: () => Promise<T>): Promise<T> {
  return healthCache.get(HEALTH_SIGNAL_CACHE_KEY, load);
}

/** Drop the cached report. Exported for tests, which must not share one. */
export function invalidateHealthCache(): void {
  healthCache.invalidate();
}
