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

// createMiddlewareClient resolves the user itself (getClaims) and returns it
// directly — middleware no longer calls supabase.auth.getUser.
function mockAuthState(user: { id: string; emailVerified: boolean } | null) {
  createMiddlewareClientMock.mockImplementation(async () => ({
    supabase: {
      auth: {
        getUser: getUserMock,
      },
    },
    response: NextResponse.next(),
    user,
    authChecked: user != null,
  }));
}

describe('WS72 middleware rate-limit and spoofing hardening', () => {
  beforeEach(() => {
    resetGlobalRateLimiter();
    vi.clearAllMocks();

    mockAuthState({ id: 'auth-user-1', emailVerified: true });
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
    mockAuthState(null);

    const response = await middleware(
      createApiRequest('/api/v1/ledger', 'GET', {
        'x-user-id': 'spoofed-auth-user',
      }),
    );

    expect(response.status).toBe(401);
    const payload = await response.json() as { error: string };
    expect(payload.error).toBe('Unauthorized');
  });

  /**
   * The counterpart to the 401 case above.
   *
   * `/api/v1` is a protected prefix, so a sessionless route is unreachable
   * unless it is in TOKEN_AUTH_ROUTES. The community bulk-email unsubscribe
   * shipped in #982 without an entry and was INERT in production: Gmail's
   * RFC 8058 one-click POST got a 401, and a human clicking the visible link
   * was redirected to /auth/login — the exact login wall the feature exists to
   * remove.
   *
   * Both verbs are asserted separately. `isTokenAuthenticatedApiRoute` matches
   * path AND method, so a GET-only entry would leave the POST 401'd; that is
   * the shape that once broke every cron.
   */
  it('does NOT 401 the no-login unsubscribe GET without a session', async () => {
    mockAuthState(null);

    const response = await middleware(
      createApiRequest('/api/v1/notifications/unsubscribe?token=whatever', 'GET'),
    );

    expect(response.status).not.toBe(401);
  });

  it('does NOT 401 the no-login unsubscribe POST — the one-click target', async () => {
    mockAuthState(null);

    const response = await middleware(
      createApiRequest('/api/v1/notifications/unsubscribe?token=whatever', 'POST'),
    );

    expect(response.status).not.toBe(401);
  });

  it('control: a NEIGHBOURING /api/v1/notifications path is still 401 without a session', async () => {
    // Proves the carve-out is path-exact rather than a prefix hole. Without
    // this, an entry that accidentally matched all of /api/v1/notifications
    // would satisfy both cases above while exposing the rest of the namespace.
    mockAuthState(null);

    const response = await middleware(
      createApiRequest('/api/v1/notifications/unread-count', 'GET'),
    );

    expect(response.status).toBe(401);
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
