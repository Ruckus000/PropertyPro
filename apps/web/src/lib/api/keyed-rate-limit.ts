/**
 * Consume `rate` units from a named bucket: Redis (Upstash) when configured, so
 * the count holds across instances; otherwise the in-memory limiter — degrade,
 * don't fail open — which counts per instance (the same trade-off as
 * `checkRateLimit` in middleware).
 *
 * One home for that policy; callers decide what an exhausted bucket means
 * (`email-budget` refuses with a 429, email-first signup answers generically).
 */
import { checkDistributedRateLimit } from '@/lib/middleware/distributed-rate-limiter';
import { getRateLimiter, type RateLimitResult } from '@/lib/middleware/rate-limiter';

export async function consumeKeyedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  rate = 1,
): Promise<RateLimitResult> {
  return (
    (await checkDistributedRateLimit(key, limit, windowMs, rate)) ??
    getRateLimiter().check(key, limit, windowMs, rate)
  );
}
