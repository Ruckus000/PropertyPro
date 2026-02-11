/**
 * In-memory rate limiter for password reset requests.
 *
 * Enforces max 3 reset requests per email address per rolling hour window.
 * Uses a Map of timestamps per email. In production, this should be backed
 * by Redis (Upstash) for multi-instance deployments; the in-memory store
 * is sufficient for single-instance / demo use.
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 3;

/** Map from normalised email → array of request timestamps (epoch ms). */
const store = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the oldest entry expires
}

/**
 * Check and consume a rate-limit token for the given email.
 *
 * @returns Whether the request is allowed, how many remain, and when the window resets.
 */
export function checkPasswordResetRateLimit(email: string): RateLimitResult {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Prune expired entries
  const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS) {
    const oldestTimestamp = timestamps[0]!;
    store.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestTimestamp + WINDOW_MS,
    };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  return {
    allowed: true,
    remaining: MAX_REQUESTS - timestamps.length,
    resetAt: timestamps[0]! + WINDOW_MS,
  };
}

/**
 * Reset the rate-limit store — useful in tests.
 */
export function resetPasswordResetRateLimitStore(): void {
  store.clear();
}

/**
 * Expose internals for testing only.
 */
export const _testInternals = {
  WINDOW_MS,
  MAX_REQUESTS,
  store,
} as const;
