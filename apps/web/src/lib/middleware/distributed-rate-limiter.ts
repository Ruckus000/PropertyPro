/**
 * Distributed (Redis-backed) rate limiting for security-critical tiers.
 *
 * ## Why only some tiers
 *
 * `rate-limiter.ts` is an in-memory `Map` scoped to one Edge isolate. For the
 * high-volume tiers that is a deliberate, sensible trade: the counter is free
 * and approximate throttling is all they need.
 *
 * It is NOT sufficient for the tiers whose whole job is to stop an attacker who
 * can simply keep making requests. Vercel runs many isolates and recycles them,
 * so a per-isolate counter means the real ceiling on login attempts is
 * "10/min × however many isolates the platform happens to give you" — unbounded
 * and unknowable. That is the `auth` tier's entire purpose (credential
 * stuffing) and the `esign-sign` tier's (repeated signature submission against
 * a token). Those two need shared state; nothing else does.
 *
 * Confining Redis to them keeps the network round-trip off every page view and
 * every ordinary API call.
 *
 * ## Degrade, don't fail open
 *
 * If Redis is unreachable or unconfigured, `checkDistributedRateLimit` returns
 * `null` and the caller falls back to the in-memory limiter — i.e. to the
 * behaviour that shipped before this file existed, not to *no limit*. Failing
 * fully open would turn a Redis blip into "brute-force protection is off";
 * failing closed would turn it into "nobody can log in". Neither is acceptable,
 * so we degrade.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { RateLimitResult } from './rate-limiter';

/** Tiers that require shared state across isolates. */
export type DistributedCategory = 'auth' | 'esign-sign';

function readEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

export function isDistributedLimiterConfigured(): boolean {
  return readEnv() !== null;
}

let redisClient: Redis | null = null;
const limiterCache = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  const env = readEnv();
  if (!env) return null;
  if (!redisClient) {
    redisClient = new Redis({ url: env.url, token: env.token });
  }
  return redisClient;
}

/**
 * `@upstash/ratelimit` instances are per (limit, window) pair, so cache them —
 * constructing one per request would allocate on every login attempt.
 */
function getLimiter(limit: number, windowMs: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      // Sliding window matches the semantics of the in-memory limiter this
      // falls back to, so behaviour does not change shape when Redis drops out.
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: 'pp:rl',
      analytics: false,
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

/** Reset cached clients. Test-only. */
export function resetDistributedRateLimiter(): void {
  redisClient = null;
  limiterCache.clear();
}

/**
 * Check a distributed tier.
 *
 * @returns the verdict, or `null` when Redis is unconfigured/unreachable — the
 *   caller MUST then fall back to the in-memory limiter rather than allowing
 *   the request unconditionally.
 */
export async function checkDistributedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const limiter = getLimiter(limit, windowMs);
  if (!limiter) return null;

  try {
    const { success, remaining, reset } = await limiter.limit(key);
    const retryAfterMs = reset - Date.now();
    return {
      allowed: success,
      remaining: Math.max(0, remaining),
      limit,
      retryAfter: success ? 0 : Math.ceil(Math.max(retryAfterMs, 1000) / 1000),
    };
  } catch {
    // Swallowed deliberately. The caller degrades to the in-memory limiter, so
    // a Redis outage costs accuracy across isolates, not availability. Not
    // logged per-request: an outage would emit one event per login attempt.
    return null;
  }
}
