/**
 * Edge Runtime compatible sliding window rate limiter.
 *
 * Uses an in-memory store with a sliding window counter algorithm.
 * Vercel Edge functions are ephemeral, so counters reset on cold starts.
 * This is intentionally lenient — production hardening can add Redis later.
 *
 * No Node.js APIs used — fully Edge Runtime compatible.
 */

/** A single timestamped request entry within a window. */
interface WindowEntry {
  /** Timestamp in milliseconds when this sub-window started. */
  timestamp: number;
  /** Number of requests in this sub-window. */
  count: number;
}

/** Stored state for a single rate-limit key. */
interface RateLimitBucket {
  /** Sub-window entries for sliding window calculation. */
  entries: WindowEntry[];
  /** Last access timestamp for LRU eviction. */
  lastAccess: number;
}

/** Result of a rate limit check. */
export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Number of remaining requests in the current window. */
  remaining: number;
  /** Maximum requests allowed in the window. */
  limit: number;
  /** Seconds until the oldest entry in the window expires (for Retry-After). */
  retryAfter: number;
}

/** Configuration for rate limiter store. */
interface RateLimiterConfig {
  /** Maximum number of keys to store (LRU eviction beyond this). */
  maxKeys?: number;
  /** Sub-window granularity in milliseconds. Smaller = more accurate but more memory. */
  subWindowMs?: number;
}

const DEFAULT_MAX_KEYS = 4096;
const DEFAULT_SUB_WINDOW_MS = 5_000; // 5-second sub-windows

/**
 * In-memory sliding window rate limiter.
 *
 * The sliding window algorithm divides the rate limit window into sub-windows.
 * When checking the rate, it sums counts from sub-windows that fall within
 * the current sliding window, providing smoother rate limiting than fixed windows.
 */
export class SlidingWindowRateLimiter {
  private readonly store = new Map<string, RateLimitBucket>();
  private readonly maxKeys: number;
  private readonly subWindowMs: number;

  constructor(config?: RateLimiterConfig) {
    this.maxKeys = config?.maxKeys ?? DEFAULT_MAX_KEYS;
    this.subWindowMs = config?.subWindowMs ?? DEFAULT_SUB_WINDOW_MS;
  }

  /**
   * Check and record a request against the rate limit.
   *
   * @param key - Unique identifier (IP address or user ID)
   * @param limit - Maximum number of requests allowed in the window
   * @param windowMs - Window duration in milliseconds
   * @returns Rate limit result with allowed status and metadata
   */
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;
    const subWindowKey = Math.floor(now / this.subWindowMs) * this.subWindowMs;

    let bucket = this.store.get(key);

    if (!bucket) {
      bucket = { entries: [], lastAccess: now };
      this.evictIfNeeded();
      this.store.set(key, bucket);
    }

    // Prune expired sub-windows
    bucket.entries = bucket.entries.filter((entry) => entry.timestamp > windowStart);
    bucket.lastAccess = now;

    // Count total requests in current window
    const currentCount = bucket.entries.reduce((sum, entry) => sum + entry.count, 0);

    if (currentCount >= limit) {
      // Find the oldest entry to calculate retry-after
      const oldestEntry = bucket.entries[0];
      const retryAfterMs = oldestEntry
        ? oldestEntry.timestamp + windowMs - now
        : windowMs;

      return {
        allowed: false,
        remaining: 0,
        limit,
        retryAfter: Math.ceil(Math.max(retryAfterMs, 1000) / 1000),
      };
    }

    // Increment the current sub-window
    const existingSubWindow = bucket.entries.find(
      (entry) => entry.timestamp === subWindowKey,
    );
    if (existingSubWindow) {
      existingSubWindow.count++;
    } else {
      bucket.entries.push({ timestamp: subWindowKey, count: 1 });
    }

    return {
      allowed: true,
      remaining: limit - currentCount - 1,
      limit,
      retryAfter: 0,
    };
  }

  /**
   * Reset the rate limiter state (useful for testing).
   */
  reset(): void {
    this.store.clear();
  }

  /**
   * Get the current number of tracked keys.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Evict the least-recently-used key if at capacity.
   */
  private evictIfNeeded(): void {
    if (this.store.size < this.maxKeys) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, bucket] of this.store) {
      if (bucket.lastAccess < oldestTime) {
        oldestTime = bucket.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}

/**
 * Singleton rate limiter instance shared across middleware invocations
 * within the same Edge Runtime isolate.
 */
let globalInstance: SlidingWindowRateLimiter | null = null;

export function getRateLimiter(): SlidingWindowRateLimiter {
  if (!globalInstance) {
    globalInstance = new SlidingWindowRateLimiter();
  }
  return globalInstance;
}

/**
 * Reset the global rate limiter instance (for testing only).
 */
export function resetGlobalRateLimiter(): void {
  globalInstance?.reset();
  globalInstance = null;
}
