/**
 * A five-minute, in-process cache for the Stripe billing read.
 *
 * ## Why cache at all
 *
 * `getBillingOverview` pages `stripe.subscriptions.list` up to five times and
 * then joins the result to `communities`. Every shell render asks the billing
 * SIGNAL provider for a past-due count, and the `/billing` screen asks for the
 * same data again; uncached, opening one page would cost ten Stripe round-trips
 * and put the console's own responsiveness on Stripe's latency.
 *
 * ## What this is NOT
 *
 * It is not a source of truth and it is not shared. The map lives in one Node
 * process, so a multi-instance deployment holds N independent copies, each up to
 * five minutes stale, and a redeploy drops all of them. That is acceptable
 * precisely because nothing here is authoritative: Stripe is the source of truth
 * for every value in it (spec D17 — admin never writes `communities.subscription_*`),
 * and the only thing a stale entry can cause is a number on a screen being up to
 * five minutes old.
 *
 * It must therefore never be used to DECIDE anything. The five subscription
 * actions all re-`retrieve` the live subscription from Stripe rather than reading
 * a row out of here — a cached `trial_end` or price id is exactly the kind of
 * value that, used as the basis for a write, charges the wrong amount.
 *
 * ## Why every action invalidates it
 *
 * An operator who extends a trial and is then shown the pre-change trial end for
 * five minutes will reasonably extend it again. `invalidateBillingCache()` after
 * each successful write makes the next read go to Stripe.
 *
 * @module lib/server/billing-cache
 */

interface CacheEntry {
  value: unknown;
  /** Epoch ms after which `value` must not be served. */
  expiresAt: number;
}

/** Five minutes. One place, so the overview and the signal provider agree. */
export const BILLING_CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

/**
 * In-flight loads, keyed identically to `cache`.
 *
 * Without this, the `/billing` page and the shell's signal provider rendering in
 * the same request tick both miss the cache and both page Stripe — the stampede
 * the cache exists to prevent, on exactly the access pattern that motivated it.
 * A rejected load is removed so a transient Stripe failure is not remembered as
 * a permanent one.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Bumped by `invalidateBillingCache()`.
 *
 * A load that was already in flight when a write landed resolves with PRE-write
 * data. Clearing the map is not enough to keep that out of the cache — the
 * loader's own `.then` runs after the clear and would happily store it for five
 * minutes, which is the exact staleness the invalidation exists to end. So each
 * load remembers the generation it started in and declines to cache its result
 * if that generation is no longer current. The caller still receives the value
 * it asked for; it simply is not remembered.
 */
let generation = 0;

/**
 * Serve `key` from cache, or run `load` and cache its result for `ttlMs`.
 *
 * Failures are NOT cached: a loader that throws leaves the cache untouched and
 * propagates, so the caller decides (a 503, a degraded signal) rather than being
 * handed a stale success.
 */
export async function withBillingCache<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs: number = BILLING_CACHE_TTL_MS,
  now: number = Date.now(),
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  // Expired: drop it before awaiting, so a slow loader cannot serve a value
  // that was already stale when the await started.
  if (hit) cache.delete(key);

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const startedIn = generation;
  const pending = load()
    .then((value) => {
      if (generation === startedIn) {
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, pending);
  return pending as Promise<T>;
}

/**
 * Drop every cached billing read.
 *
 * Called by each of the five subscription actions after Stripe has accepted the
 * write. Deliberately whole-cache rather than per-key: the overview is a
 * platform-wide aggregate, so a single community's plan change moves the MRR KPI
 * and the row, and there is no per-community key to evict.
 */
export function invalidateBillingCache(): void {
  cache.clear();
  // In-flight loads cannot be cancelled, so they are instead disqualified from
  // caching by the generation bump — see `generation` above. They are also
  // un-registered, so the next caller starts a fresh load against post-write
  // Stripe state rather than joining a read that predates the write.
  generation += 1;
  inFlight.clear();
}
