import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  SlidingWindowRateLimiter,
  resetGlobalRateLimiter,
} from '../../src/lib/middleware/rate-limiter';
import {
  checkRateLimit,
  classifyRoute,
  extractClientIp,
  buildRateLimitKey,
  rateLimitedResponse,
  type RateLimitCheckResult,
} from '../../src/lib/middleware/rate-limit-config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(
  url: string,
  options?: { method?: string; headers?: Record<string, string> },
): NextRequest {
  return new NextRequest(url, {
    method: options?.method ?? 'GET',
    headers: options?.headers,
  });
}

// ---------------------------------------------------------------------------
// SlidingWindowRateLimiter — core unit tests
// ---------------------------------------------------------------------------

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    // Use a very small sub-window for predictable test behavior
    limiter = new SlidingWindowRateLimiter({ subWindowMs: 1 });
  });

  it('allows requests under the limit', () => {
    const result = limiter.check('test-key', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
    expect(result.retryAfter).toBe(0);
  });

  it('increments counter correctly on repeated requests', () => {
    const r1 = limiter.check('test-key', 5, 60_000);
    expect(r1.remaining).toBe(4);

    const r2 = limiter.check('test-key', 5, 60_000);
    expect(r2.remaining).toBe(3);

    const r3 = limiter.check('test-key', 5, 60_000);
    expect(r3.remaining).toBe(2);
  });

  it('blocks requests when limit is reached', () => {
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      limiter.check('test-key', 5, 60_000);
    }

    const result = limiter.check('test-key', 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('returns retryAfter in whole seconds', () => {
    for (let i = 0; i < 3; i++) {
      limiter.check('test-key', 3, 60_000);
    }

    const result = limiter.check('test-key', 3, 60_000);
    expect(result.allowed).toBe(false);
    // retryAfter should be a positive integer (seconds)
    expect(Number.isInteger(result.retryAfter)).toBe(true);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('sliding window: old requests expire and new ones are allowed', () => {
    // Use a 100ms window for fast expiry
    const windowMs = 100;
    const now = Date.now();

    // Mock Date.now for precise control
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      limiter.check('sliding-key', 3, windowMs);
    }

    // Should be blocked now
    let result = limiter.check('sliding-key', 3, windowMs);
    expect(result.allowed).toBe(false);

    // Advance time past the window
    vi.spyOn(Date, 'now').mockReturnValue(now + windowMs + 1);

    // Should be allowed again (old entries expired)
    result = limiter.check('sliding-key', 3, windowMs);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);

    vi.restoreAllMocks();
  });

  it('tracks different keys independently', () => {
    // Exhaust limit for key A
    for (let i = 0; i < 2; i++) {
      limiter.check('key-a', 2, 60_000);
    }

    const resultA = limiter.check('key-a', 2, 60_000);
    expect(resultA.allowed).toBe(false);

    // Key B should still be allowed
    const resultB = limiter.check('key-b', 2, 60_000);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(1);
  });

  it('evicts LRU entries when maxKeys is exceeded', () => {
    const smallLimiter = new SlidingWindowRateLimiter({
      maxKeys: 3,
      subWindowMs: 1,
    });

    smallLimiter.check('key-1', 10, 60_000);
    smallLimiter.check('key-2', 10, 60_000);
    smallLimiter.check('key-3', 10, 60_000);

    // Adding a 4th key should evict the oldest (key-1)
    smallLimiter.check('key-4', 10, 60_000);
    expect(smallLimiter.size).toBe(3);
  });

  it('reset clears all state', () => {
    limiter.check('key-1', 10, 60_000);
    limiter.check('key-2', 10, 60_000);
    expect(limiter.size).toBe(2);

    limiter.reset();
    expect(limiter.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// classifyRoute — route categorization
// ---------------------------------------------------------------------------

describe('classifyRoute', () => {
  it('classifies auth login route', () => {
    expect(classifyRoute('/auth/login', 'POST')).toBe('auth');
    expect(classifyRoute('/signup', 'POST')).toBe('auth');
    expect(classifyRoute('/auth/signup', 'POST')).toBe('auth');
    expect(classifyRoute('/auth/password-reset', 'POST')).toBe('auth');
    expect(classifyRoute('/auth/forgot-password', 'POST')).toBe('auth');
  });

  it('classifies API auth routes', () => {
    expect(classifyRoute('/api/v1/auth/login', 'POST')).toBe('auth');
    expect(classifyRoute('/api/v1/auth/signup', 'POST')).toBe('auth');
    expect(classifyRoute('/api/v1/auth/password-reset', 'POST')).toBe('auth');
  });

  it('classifies webhook routes as exempt', () => {
    expect(classifyRoute('/api/v1/webhooks/stripe', 'POST')).toBe('webhook');
    expect(classifyRoute('/api/webhooks/stripe', 'POST')).toBe('webhook');
  });

  it('classifies API GET requests as read', () => {
    expect(classifyRoute('/api/v1/documents', 'GET')).toBe('read');
    expect(classifyRoute('/api/v1/meetings', 'GET')).toBe('read');
    expect(classifyRoute('/api/v1/communities/1/documents', 'HEAD')).toBe('read');
    expect(classifyRoute('/api/v1/test', 'OPTIONS')).toBe('read');
  });

  it('classifies public transparency endpoint as public tier', () => {
    expect(classifyRoute('/api/v1/transparency', 'GET')).toBe('public');
  });

  it('classifies API write methods as write', () => {
    expect(classifyRoute('/api/v1/documents', 'POST')).toBe('write');
    expect(classifyRoute('/api/v1/documents/1', 'PATCH')).toBe('write');
    expect(classifyRoute('/api/v1/documents/1', 'DELETE')).toBe('write');
    expect(classifyRoute('/api/v1/documents/1', 'PUT')).toBe('write');
  });

  it('classifies non-API non-auth routes as public', () => {
    expect(classifyRoute('/', 'GET')).toBe('public');
    expect(classifyRoute('/about', 'GET')).toBe('public');
    expect(classifyRoute('/pricing', 'GET')).toBe('public');
    expect(classifyRoute('/dashboard', 'GET')).toBe('public');
  });
});

// ---------------------------------------------------------------------------
// extractClientIp
// ---------------------------------------------------------------------------

describe('extractClientIp', () => {
  it('prefers x-real-ip header', () => {
    const request = createRequest('http://localhost:3000/api/test', {
      headers: {
        'x-real-ip': '1.2.3.4',
        'x-forwarded-for': '5.6.7.8',
      },
    });
    expect(extractClientIp(request)).toBe('1.2.3.4');
  });

  it('falls back to x-forwarded-for (first IP)', () => {
    const request = createRequest('http://localhost:3000/api/test', {
      headers: {
        'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3',
      },
    });
    expect(extractClientIp(request)).toBe('10.0.0.1');
  });

  it('returns "unknown" when no IP headers present', () => {
    const request = createRequest('http://localhost:3000/api/test');
    expect(extractClientIp(request)).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// buildRateLimitKey
// ---------------------------------------------------------------------------

describe('buildRateLimitKey', () => {
  it('uses IP for auth routes regardless of user ID', () => {
    expect(buildRateLimitKey('auth', '1.2.3.4', 'user-123')).toBe(
      'rl:auth:ip:1.2.3.4',
    );
  });

  it('uses IP for public routes regardless of user ID', () => {
    expect(buildRateLimitKey('public', '1.2.3.4', 'user-123')).toBe(
      'rl:public:ip:1.2.3.4',
    );
  });

  it('uses user ID for read routes when available', () => {
    expect(buildRateLimitKey('read', '1.2.3.4', 'user-123')).toBe(
      'rl:read:user-123',
    );
  });

  it('uses user ID for write routes when available', () => {
    expect(buildRateLimitKey('write', '1.2.3.4', 'user-456')).toBe(
      'rl:write:user-456',
    );
  });

  it('falls back to IP for authenticated routes when no user ID', () => {
    expect(buildRateLimitKey('read', '1.2.3.4', null)).toBe(
      'rl:read:ip:1.2.3.4',
    );
    expect(buildRateLimitKey('write', '1.2.3.4', null)).toBe(
      'rl:write:ip:1.2.3.4',
    );
  });
});

// ---------------------------------------------------------------------------
// checkRateLimit — integration of limiter + config
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetGlobalRateLimiter();
  });

  afterEach(() => {
    resetGlobalRateLimiter();
  });

  it('returns null for webhook routes (exempt)', () => {
    const request = createRequest('http://localhost:3000/api/v1/webhooks/stripe', {
      method: 'POST',
    });
    const result = checkRateLimit(request, null);
    expect(result).toBeNull();
  });

  it('allows requests under the limit for auth routes', () => {
    const request = createRequest('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'x-real-ip': '10.0.0.1' },
    });
    const result = checkRateLimit(request, null);
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(true);
    expect(result!.category).toBe('auth');
    expect(result!.limit).toBe(10);
  });

  it('uses public 60/min tier for GET /api/v1/transparency', () => {
    const request = createRequest('http://localhost:3000/api/v1/transparency?slug=sunset-condos', {
      method: 'GET',
      headers: { 'x-real-ip': '10.0.0.2' },
    });
    const result = checkRateLimit(request, null);

    expect(result).not.toBeNull();
    expect(result!.category).toBe('public');
    expect(result!.limit).toBe(60);
    expect(result!.allowed).toBe(true);
  });

  it('enforces auth route limit (10 req/min)', () => {
    const ip = '10.0.0.99';
    for (let i = 0; i < 10; i++) {
      const request = createRequest('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'x-real-ip': ip },
      });
      const result = checkRateLimit(request, null);
      expect(result!.allowed).toBe(true);
    }

    // 11th request should be blocked
    const request = createRequest('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'x-real-ip': ip },
    });
    const result = checkRateLimit(request, null);
    expect(result!.allowed).toBe(false);
    expect(result!.category).toBe('auth');
  });

  it('enforces read route limit (100 req/min)', () => {
    const userId = 'user-read-test';
    for (let i = 0; i < 100; i++) {
      const request = createRequest('http://localhost:3000/api/v1/documents', {
        method: 'GET',
        headers: { 'x-real-ip': '10.0.0.1' },
      });
      const result = checkRateLimit(request, userId);
      expect(result!.allowed).toBe(true);
    }

    // 101st request should be blocked
    const request = createRequest('http://localhost:3000/api/v1/documents', {
      method: 'GET',
      headers: { 'x-real-ip': '10.0.0.1' },
    });
    const result = checkRateLimit(request, userId);
    expect(result!.allowed).toBe(false);
    expect(result!.category).toBe('read');
  });

  it('enforces write route limit (30 req/min)', () => {
    const userId = 'user-write-test';
    for (let i = 0; i < 30; i++) {
      const request = createRequest('http://localhost:3000/api/v1/documents', {
        method: 'POST',
        headers: { 'x-real-ip': '10.0.0.1' },
      });
      const result = checkRateLimit(request, userId);
      expect(result!.allowed).toBe(true);
    }

    // 31st request should be blocked
    const request = createRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: { 'x-real-ip': '10.0.0.1' },
    });
    const result = checkRateLimit(request, userId);
    expect(result!.allowed).toBe(false);
    expect(result!.category).toBe('write');
  });

  it('enforces public route limit (60 req/min)', () => {
    const ip = '10.0.0.200';
    for (let i = 0; i < 60; i++) {
      const request = createRequest('http://localhost:3000/', {
        method: 'GET',
        headers: { 'x-real-ip': ip },
      });
      const result = checkRateLimit(request, null);
      expect(result!.allowed).toBe(true);
    }

    // 61st request should be blocked
    const request = createRequest('http://localhost:3000/', {
      method: 'GET',
      headers: { 'x-real-ip': ip },
    });
    const result = checkRateLimit(request, null);
    expect(result!.allowed).toBe(false);
    expect(result!.category).toBe('public');
  });

  it('different routes get different limits', () => {
    // Auth route: limit 10
    const authReq = createRequest('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'x-real-ip': '10.0.0.1' },
    });
    const authResult = checkRateLimit(authReq, null);
    expect(authResult!.limit).toBe(10);

    // Read route: limit 100
    const readReq = createRequest('http://localhost:3000/api/v1/documents', {
      method: 'GET',
      headers: { 'x-real-ip': '10.0.0.2' },
    });
    const readResult = checkRateLimit(readReq, 'user-1');
    expect(readResult!.limit).toBe(100);

    // Write route: limit 30
    const writeReq = createRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: { 'x-real-ip': '10.0.0.3' },
    });
    const writeResult = checkRateLimit(writeReq, 'user-2');
    expect(writeResult!.limit).toBe(30);

    // Public route: limit 60
    const publicReq = createRequest('http://localhost:3000/about', {
      method: 'GET',
      headers: { 'x-real-ip': '10.0.0.4' },
    });
    const publicResult = checkRateLimit(publicReq, null);
    expect(publicResult!.limit).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// rateLimitedResponse — 429 response format
// ---------------------------------------------------------------------------

describe('rateLimitedResponse', () => {
  it('returns 429 status', () => {
    const result: RateLimitCheckResult = {
      allowed: false,
      remaining: 0,
      limit: 10,
      retryAfter: 42,
      category: 'auth',
    };

    const response = rateLimitedResponse(result, 'req-123');
    expect(response.status).toBe(429);
  });

  it('includes Retry-After header with correct value', () => {
    const result: RateLimitCheckResult = {
      allowed: false,
      remaining: 0,
      limit: 30,
      retryAfter: 15,
      category: 'write',
    };

    const response = rateLimitedResponse(result, 'req-456');
    expect(response.headers.get('Retry-After')).toBe('15');
  });

  it('includes X-RateLimit-Limit header', () => {
    const result: RateLimitCheckResult = {
      allowed: false,
      remaining: 0,
      limit: 100,
      retryAfter: 30,
      category: 'read',
    };

    const response = rateLimitedResponse(result, 'req-789');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('includes X-Request-ID header', () => {
    const result: RateLimitCheckResult = {
      allowed: false,
      remaining: 0,
      limit: 10,
      retryAfter: 5,
      category: 'auth',
    };

    const response = rateLimitedResponse(result, 'trace-abc');
    expect(response.headers.get('X-Request-ID')).toBe('trace-abc');
  });

  it('returns correct JSON body format', async () => {
    const result: RateLimitCheckResult = {
      allowed: false,
      remaining: 0,
      limit: 10,
      retryAfter: 42,
      category: 'auth',
    };

    const response = rateLimitedResponse(result, 'req-body-test');
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many requests',
        retryAfter: 42,
      },
    });
  });

  it('sets Content-Type to application/json', () => {
    const result: RateLimitCheckResult = {
      allowed: false,
      remaining: 0,
      limit: 10,
      retryAfter: 5,
      category: 'auth',
    };

    const response = rateLimitedResponse(result, 'req-ct');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});
