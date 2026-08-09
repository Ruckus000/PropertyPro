/**
 * Distributed rate limiter — configuration and DEGRADATION behaviour.
 *
 * The degradation contract is the security-relevant part and the reason this
 * file exists: when Redis is unreachable the limiter must fall back to the
 * in-memory counter, NOT allow the request. Failing fully open would turn a
 * Redis blip into "brute-force protection is off" — the exact property the
 * distributed tier was added to provide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ENV_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.resetModules();
  vi.restoreAllMocks();
});

function clearUpstashEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

function setUpstashEnv(): void {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
}

describe('isDistributedLimiterConfigured', () => {
  it('is false when either env var is missing', async () => {
    clearUpstashEnv();
    const mod = await import('../../src/lib/middleware/distributed-rate-limiter');
    expect(mod.isDistributedLimiterConfigured()).toBe(false);

    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    expect(mod.isDistributedLimiterConfigured()).toBe(false);
  });

  it('is true only when both are present', async () => {
    setUpstashEnv();
    const mod = await import('../../src/lib/middleware/distributed-rate-limiter');
    expect(mod.isDistributedLimiterConfigured()).toBe(true);
  });

  it('treats whitespace-only values as unset', async () => {
    process.env.UPSTASH_REDIS_REST_URL = '   ';
    process.env.UPSTASH_REDIS_REST_TOKEN = '   ';
    const mod = await import('../../src/lib/middleware/distributed-rate-limiter');
    expect(mod.isDistributedLimiterConfigured()).toBe(false);
  });
});

describe('checkDistributedRateLimit', () => {
  it('returns null when Redis is not configured', async () => {
    clearUpstashEnv();
    const mod = await import('../../src/lib/middleware/distributed-rate-limiter');
    expect(await mod.checkDistributedRateLimit('k', 10, 60_000)).toBeNull();
  });

  it('returns null (not a verdict) when Redis throws', async () => {
    setUpstashEnv();
    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: class {
        static slidingWindow() {
          return {};
        }
        limit() {
          return Promise.reject(new Error('ECONNREFUSED'));
        }
      },
    }));
    const mod = await import('../../src/lib/middleware/distributed-rate-limiter');
    // null is the signal to degrade. If this ever returned {allowed: true} a
    // Redis outage would silently disable the auth-tier limit.
    expect(await mod.checkDistributedRateLimit('k', 10, 60_000)).toBeNull();
  });

  it('maps an Upstash verdict onto the shared RateLimitResult shape', async () => {
    setUpstashEnv();
    const reset = Date.now() + 30_000;
    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: class {
        static slidingWindow() {
          return {};
        }
        limit() {
          return Promise.resolve({ success: false, remaining: 0, reset });
        }
      },
    }));
    const mod = await import('../../src/lib/middleware/distributed-rate-limiter');
    const result = await mod.checkDistributedRateLimit('k', 10, 60_000);

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.limit).toBe(10);
    expect(result!.remaining).toBe(0);
    // Seconds, rounded up, floored at 1 — matching the in-memory limiter so the
    // Retry-After a client sees does not change shape when Redis drops out.
    expect(result!.retryAfter).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(result!.retryAfter)).toBe(true);
  });
});

describe('checkRateLimit degradation', () => {
  it('still enforces the auth tier in-memory when Redis is unavailable', async () => {
    clearUpstashEnv();
    const { checkRateLimit } = await import(
      '../../src/lib/middleware/rate-limit-config'
    );

    const make = () =>
      new NextRequest('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.9' },
      });

    for (let i = 0; i < 10; i++) {
      expect((await checkRateLimit(make(), null))!.allowed).toBe(true);
    }
    // The 11th must be refused. Without the in-memory fallback this would be
    // `true` forever and the tier would be decorative.
    const blocked = await checkRateLimit(make(), null);
    expect(blocked!.allowed).toBe(false);
    expect(blocked!.category).toBe('auth');
  });
});
