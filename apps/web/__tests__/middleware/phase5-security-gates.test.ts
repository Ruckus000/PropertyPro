import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { resetGlobalRateLimiter } from '../../src/lib/middleware/rate-limiter';

const { createMiddlewareClientMock, getUserMock } = vi.hoisted(() => ({
  createMiddlewareClientMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { middleware } from '../../src/middleware';

function createApiRequest(
  pathname: string,
  method: string,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method,
    headers: {
      host: 'localhost:3000',
      'x-real-ip': '203.0.113.7',
      ...headers,
    },
  });
}

describe('WS72 middleware rate-limit and spoofing hardening', () => {
  beforeEach(() => {
    resetGlobalRateLimiter();
    vi.clearAllMocks();

    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'auth-user-1',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    createMiddlewareClientMock.mockImplementation(async () => ({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
      },
      response: NextResponse.next(),
    }));
  });

  afterEach(() => {
    resetGlobalRateLimiter();
  });

  it('returns 429 for write-heavy Phase 5 traffic after threshold', async () => {
    for (let i = 0; i < 30; i++) {
      const response = await middleware(createApiRequest('/api/v1/assessments', 'POST'));
      expect(response.status).not.toBe(429);
    }

    const blockedResponse = await middleware(createApiRequest('/api/v1/assessments', 'POST'));
    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.headers.get('Retry-After')).toBeTruthy();

    const payload = await blockedResponse.json() as {
      error: { code: string; message: string; retryAfter: number };
    };
    expect(payload.error.code).toBe('rate_limited');
    expect(payload.error.retryAfter).toBeGreaterThan(0);
  });

  it('does not allow spoofed x-user-id headers to bypass write throttling', async () => {
    for (let i = 0; i < 30; i++) {
      const response = await middleware(
        createApiRequest('/api/v1/work-orders', 'POST', {
          'x-user-id': `spoof-user-${i}`,
        }),
      );
      expect(response.status).not.toBe(429);
    }

    const blockedResponse = await middleware(
      createApiRequest('/api/v1/work-orders', 'POST', {
        'x-user-id': 'spoof-user-final',
      }),
    );

    expect(blockedResponse.status).toBe(429);

    const payload = await blockedResponse.json() as {
      error: { code: string; retryAfter: number };
    };
    expect(payload.error.code).toBe('rate_limited');
    expect(payload.error.retryAfter).toBeGreaterThan(0);
  });

  it('returns 401 for protected Phase 5 APIs when session is absent, even with spoofed x-user-id', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
    });

    const response = await middleware(
      createApiRequest('/api/v1/ledger', 'GET', {
        'x-user-id': 'spoofed-auth-user',
      }),
    );

    expect(response.status).toBe(401);
    const payload = await response.json() as { error: string };
    expect(payload.error).toBe('Unauthorized');
  });

  it('strips spoofed tenant headers before forwarding downstream', async () => {
    const spoofedCommunity = '1;DROP TABLE communities;--';
    const spoofedUser = 'attacker-user';

    const response = await middleware(
      createApiRequest('/api/v1/ledger', 'GET', {
        'x-community-id': spoofedCommunity,
        'x-user-id': spoofedUser,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBeTruthy();

    const forwardedCommunity = response.headers.get('x-middleware-request-x-community-id');
    const forwardedUser = response.headers.get('x-middleware-request-x-user-id');

    expect(forwardedCommunity).toBeNull();
    if (forwardedUser !== null) {
      expect(forwardedUser).not.toBe(spoofedUser);
    }
  });
});
