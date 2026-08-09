import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { getUserMock, createMiddlewareClientMock, fromMock, selectMock, eqMock, isMock, limitMock, rpcMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  createMiddlewareClientMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  limitMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { middleware } from '../../src/middleware';
import { UNKNOWN_SUBDOMAIN_REASON } from '../../src/lib/middleware/unknown-subdomain-reason';

function request(
  url: string,
  headers?: Record<string, string>,
  method: string = 'GET',
): NextRequest {
  return new NextRequest(url, {
    method,
    headers,
  });
}

interface MockMiddlewareUser {
  id: string;
  emailVerified: boolean;
  email?: string | null;
  phone?: string | null;
  user_metadata?: { full_name: string | null };
}

// createMiddlewareClient resolves the user itself (getClaims) and returns it
// directly — middleware no longer calls supabase.auth.getUser.
function mockAuthState(user: MockMiddlewareUser | null) {
  createMiddlewareClientMock.mockImplementation(async () => ({
    supabase: {
      auth: {
        getUser: getUserMock,
      },
      from: fromMock,
      rpc: rpcMock,
    },
    response: NextResponse.next(),
    user,
    authChecked: user != null,
  }));
}

describe('p1-22 session middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Tenant resolution uses the SECURITY DEFINER RPCs from migration 0045,
    // not a direct read of `communities` — the anon-keyed client cannot see
    // that table, which is what broke every public site. `data` is the scalar
    // community id, or null when the host resolves to nothing.
    rpcMock.mockResolvedValue({ data: null, error: null });

    limitMock.mockResolvedValue({
      data: [],
      error: null,
    });
    isMock.mockReturnValue({ limit: limitMock });
    eqMock.mockReturnValue({ is: isMock });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });

    mockAuthState(null);

    getUserMock.mockResolvedValue({
      data: {
        user: null,
      },
    });
  });

  it('preserves incoming x-request-id header', async () => {
    const response = await middleware(
      request('http://localhost:3000/', { 'x-request-id': 'req-123' }),
    );

    expect(response.headers.get('X-Request-ID')).toBe('req-123');
  });

  it('redirects unauthenticated protected requests to login with returnTo', async () => {
    const response = await middleware(
      request('http://localhost:3000/dashboard?tab=overview'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
    expect(response.headers.get('location')).toContain('returnTo=%2Fdashboard%3Ftab%3Doverview');
  });

  it('returns 401 JSON for unauthenticated protected API routes', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/documents?communityId=8'),
    );
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('location')).toBeNull();
    expect(json.error).toBe('Unauthorized');
  });

  it('allows unauthenticated invitation token acceptance route', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/invitations', {}, 'PATCH'),
    );

    expect(response.status).toBe(200);
  });

  it('allows unauthenticated GET /api/v1/auth/signup for subdomain checks', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/auth/signup?subdomain=sunrise-cove', {}, 'GET'),
    );

    expect(response.status).toBe(200);
  });

  it('allows unauthenticated POST /api/v1/auth/signup', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/auth/signup', {}, 'POST'),
    );

    expect(response.status).toBe(200);
  });

  it('allows unauthenticated GET /api/v1/transparency', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/transparency?slug=sunset-condos', {}, 'GET'),
    );

    expect(response.status).toBe(200);
  });

  it('keeps unauthenticated POST /api/v1/invitations protected', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/invitations', {}, 'POST'),
    );
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('allows unauthenticated POST /api/v1/internal/notification-digests/process', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/internal/notification-digests/process', {}, 'POST'),
    );

    expect(response.status).toBe(200);
  });

  it('allows unauthenticated GET /api/v1/internal/* through to the route', async () => {
    // This used to assert 401 — middleware's allowlist was method-specific and
    // only listed POST. That is precisely what broke every scheduled job in
    // production: Vercel Cron issues GET, so middleware rejected it before the
    // route ran (a 401, not the 405 the missing handler would suggest).
    //
    // Middleware deliberately no longer gates these. The gate is
    // requireCronSecret() inside each route, which fails closed and is enforced
    // for EVERY internal route by `guard:internal-cron-auth`. See the
    // companion test below for the session-bypass boundary.
    const response = await middleware(
      request('http://localhost:3000/api/v1/internal/notification-digests/process', {}, 'GET'),
    );

    expect(response.status).toBe(200);
  });

  it('does not extend the internal bypass to other /api/v1 paths', async () => {
    // The bypass is a prefix rule, so this is the boundary that matters: a path
    // that merely *contains* "internal" elsewhere, or any other API route, must
    // still hit the session gate.
    for (const url of [
      'http://localhost:3000/api/v1/documents',
      'http://localhost:3000/api/v1/communities/internal',
    ]) {
      const response = await middleware(request(url, {}, 'GET'));
      expect(response.status).toBe(401);
    }
  });

  it('does not extend the internal bypass to unexpected methods', async () => {
    // Only GET and POST are waved through; a DELETE against an internal path
    // should still be stopped by the session gate.
    const response = await middleware(
      request('http://localhost:3000/api/v1/internal/notification-digests/process', {}, 'DELETE'),
    );

    expect(response.status).toBe(401);
  });

  it('skips tenant resolution for reserved subdomains and falls through to auth', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/documents', {
        host: 'admin.getpropertypro.com',
      }),
    );
    const json = (await response.json()) as { error: string };

    // Reserved subdomains proceed without community context; auth check returns 401
    expect(response.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 404 for unknown tenant subdomains', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    const response = await middleware(
      request('http://localhost:3000/api/v1/documents', {
        host: 'unknown.getpropertypro.com',
      }),
    );
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(json.error).toBe('Not Found');
  });

  it('redirects unknown tenant subdomain page requests to canonical select-community', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    try {
      limitMock.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const response = await middleware(
        request('http://localhost:3000/dashboard', {
          host: 'unknown.getpropertypro.com',
        }),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        `http://localhost:3000/select-community?reason=${UNKNOWN_SUBDOMAIN_REASON}`,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('redirects authenticated but unverified users to /auth/verify-email', async () => {
    mockAuthState({ id: 'user-1', emailVerified: false });

    const response = await middleware(request('http://localhost:3000/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/verify-email');
    expect(response.headers.get('location')).toContain('returnTo=%2Fdashboard');
  });

  it('returns 403 JSON for unverified users on protected API routes', async () => {
    mockAuthState({ id: 'user-1', emailVerified: false });

    const response = await middleware(request('http://localhost:3000/api/v1/documents'));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(response.headers.get('location')).toBeNull();
    expect(json.error).toBe('Email verification required');
  });

  it('allows authenticated + verified users to access protected routes', async () => {
    mockAuthState({ id: 'user-1', emailVerified: true });

    // Include ?communityId= so middleware can resolve a tenant context.
    // Without it, the missing-tenant guard correctly redirects authenticated
    // users to /select-community — covered separately in
    // middleware-no-tenant-redirect.test.ts. This test only asserts that the
    // auth/email-verification gate doesn't block a verified user.
    const response = await middleware(request('http://localhost:3000/dashboard?communityId=1'));

    expect(response.status).toBe(200);
  });

  it('allows authenticated + verified users to access protected API routes', async () => {
    mockAuthState({ id: 'user-1', emailVerified: true });

    const response = await middleware(request('http://localhost:3000/api/v1/documents'));

    expect(response.status).toBe(200);
  });

  it('allows API request after deterministic refresh transition', async () => {
    // createMiddlewareClient refreshes the session internally (getClaims →
    // getSession) and resolves the post-refresh user itself; middleware never
    // calls getUser. Simulate the post-refresh state: user resolved, verified.
    createMiddlewareClientMock.mockImplementationOnce(async () => ({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
        from: fromMock,
      },
      response: NextResponse.next(),
      user: { id: 'user-1', emailVerified: true },
      authChecked: true,
    }));

    const response = await middleware(request('http://localhost:3000/api/v1/upload'));

    expect(response.status).toBe(200);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('reuses middleware-authenticated null session without calling getUser again', async () => {
    createMiddlewareClientMock.mockResolvedValueOnce({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
      },
      response: NextResponse.next(),
      user: null,
      authChecked: true,
    });

    const response = await middleware(request('http://localhost:3000/dashboard'));

    expect(response.status).toBe(307);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('reuses middleware-authenticated user on auth pages without a second getUser call', async () => {
    createMiddlewareClientMock.mockResolvedValueOnce({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
      },
      response: NextResponse.next(),
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        user_metadata: {
          full_name: 'User Example',
        },
      },
      authChecked: true,
    });

    const response = await middleware(request('http://localhost:3000/auth/login'));

    expect(response.status).toBe(307);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('redirects authenticated users on root domain auth pages to /select-community (no tenant context)', async () => {
    mockAuthState({ id: 'user-1', emailVerified: true });

    const response = await middleware(request('http://localhost:3000/auth/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/select-community');
  });

  it('redirects authenticated users to returnTo when present on auth pages', async () => {
    mockAuthState({ id: 'user-1', emailVerified: true });

    const response = await middleware(
      request('http://localhost:3000/auth/login?returnTo=%2Fdocuments'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/documents');
  });

  it('keeps unverified users on verify-email route (no redirect loop)', async () => {
    mockAuthState({ id: 'user-1', emailVerified: false });

    const response = await middleware(request('http://localhost:3000/auth/verify-email'));

    expect(response.status).toBe(200);
  });

  it('protects /communities routes - redirects unauthenticated users', async () => {
    const response = await middleware(
      request('http://localhost:3000/communities/8/documents'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/login');
    expect(response.headers.get('location')).toContain('returnTo=%2Fcommunities%2F8%2Fdocuments');
  });

  it('allows authenticated + verified users to access /communities routes', async () => {
    mockAuthState({ id: 'user-1', emailVerified: true });

    const response = await middleware(
      request('http://localhost:3000/communities/8/documents'),
    );

    expect(response.status).toBe(200);
  });
});
