/**
 * A keyed, in-process TTL cache with in-flight deduplication — the factory.
 *
 * ## Why a factory rather than one shared map
 *
 * This code was `billing-cache.ts`, and nothing about it was ever
 * billing-specific except the name. A second consumer (the Health board's shell
 * signal) needed exactly the same three properties — a TTL, one load per key no
 * matter how many callers arrive in the same tick, and an invalidation that
 * cannot be defeated by a load that was already in flight — so the cache moved
 * here and each consumer takes its OWN instance.
 *
 * Separate instances, not one shared map with prefixed keys, and the reason is
 * semantic rather than tidiness: **billing invalidates after every money
 * action**, and a health reading has no reason to be dropped at that moment.
 * `invalidate()` bumps a generation counter and clears the map, so a shared
 * instance would make every plan change throw away the health probe results too
 * — coupling two unrelated freshness policies through a counter neither
 * consumer can see. Two instances make that impossible rather than merely
 * unlikely.
 *
 * ## What this is NOT
 *
 * It is not a source of truth and it is not shared between processes. Each map
 * lives in one Node process, so a multi-instance deployment holds N independent
 * copies and a redeploy drops all of them. That is acceptable only for values
 * where a stale entry can do nothing worse than put an old number on a screen.
 * **Never use a value read out of here to DECIDE anything** — the five
 * subscription actions all re-`retrieve` live state from Stripe rather than
 * reading a cached row, because a cached `trial_end` or price id used as the
 * basis for a write is what charges the wrong amount.
 *
 * @module lib/server/ttl-cache
 */

interface CacheEntry {
  value: unknown;
  /** Epoch ms after which `value` must not be served. */
  expiresAt: number;
}

export interface TtlCache {
  /** Serve `key` from cache, or run `load` and cache its result for `ttlMs`. */
  get<T>(key: string, load: () => Promise<T>, ttlMs?: number, now?: number): Promise<T>;
  /** Drop everything, and disqualify any load already in flight from caching. */
  invalidate(): void;
}

export function createTtlCache(defaultTtlMs: number): TtlCache {
  const cache = new Map<string, CacheEntry>();

  /**
   * In-flight loads, keyed identically to `cache`.
   *
   * Without this, two callers rendering in the same request tick both miss the
   * cache and both hit the upstream — the stampede the cache exists to prevent,
   * on exactly the access pattern that motivates it (a page and the shell's
   * signal provider asking for the same data). A rejected load is removed so a
   * transient failure is not remembered as a permanent one.
   */
  const inFlight = new Map<string, Promise<unknown>>();

  /**
   * Bumped by `invalidate()`.
   *
   * A load that was already in flight when a write landed resolves with
   * PRE-write data. Clearing the map is not enough to keep that out of the
   * cache — the loader's own `.then` runs after the clear and would happily
   * store it for the full TTL, which is the exact staleness the invalidation
   * exists to end. So each load remembers the generation it started in and
   * declines to cache its result if that generation is no longer current. The
   * caller still receives the value it asked for; it simply is not remembered.
   */
  let generation = 0;

  return {
    /**
     * Failures are NOT cached: a loader that throws leaves the cache untouched
     * and propagates, so the caller decides (a 503, a degraded signal) rather
     * than being handed a stale success.
     */
    async get<T>(
      key: string,
      load: () => Promise<T>,
      ttlMs: number = defaultTtlMs,
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
    },

    invalidate(): void {
      cache.clear();
      // In-flight loads cannot be cancelled, so they are instead disqualified
      // from caching by the generation bump — see `generation` above. They are
      // also un-registered, so the next caller starts a fresh load against
      // post-write state rather than joining a read that predates the write.
      generation += 1;
      inFlight.clear();
    },
  };
}
