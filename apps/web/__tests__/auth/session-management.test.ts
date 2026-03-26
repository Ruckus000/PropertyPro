import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { getUserMock, createMiddlewareClientMock, fromMock, selectMock, eqMock, isMock, limitMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  createMiddlewareClientMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { middleware } from '../../src/middleware';

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

describe('p1-22 session middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    limitMock.mockResolvedValue({
      data: [],
      error: null,
    });
    isMock.mockReturnValue({ limit: limitMock });
    eqMock.mockReturnValue({ is: isMock });
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });

    createMiddlewareClientMock.mockResolvedValue({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
        from: fromMock,
      },
      response: NextResponse.next(),
    });

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

  it('keeps unauthenticated GET /api/v1/internal/notification-digests/process protected', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/internal/notification-digests/process', {}, 'GET'),
    );
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 404 for reserved tenant subdomains before auth checks', async () => {
    const response = await middleware(
      request('http://localhost:3000/api/v1/documents', {
        host: 'admin.propertyprofl.com',
      }),
    );
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(json.error).toBe('Not Found');
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown tenant subdomains', async () => {
    limitMock.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const response = await middleware(
      request('http://localhost:3000/api/v1/documents', {
        host: 'unknown.propertyprofl.com',
      }),
    );
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(json.error).toBe('Not Found');
  });

  it('redirects authenticated but unverified users to /auth/verify-email', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: null,
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/verify-email');
    expect(response.headers.get('location')).toContain('returnTo=%2Fdashboard');
  });

  it('returns 403 JSON for unverified users on protected API routes', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: null,
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/api/v1/documents'));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(response.headers.get('location')).toBeNull();
    expect(json.error).toBe('Email verification required');
  });

  it('allows authenticated + verified users to access protected routes', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-02-11T21:00:00.000Z',
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/dashboard'));

    expect(response.status).toBe(200);
  });

  it('allows authenticated + verified users to access protected API routes', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-02-11T21:00:00.000Z',
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/api/v1/documents'));

    expect(response.status).toBe(200);
  });

  it('allows API request after deterministic refresh transition', async () => {
    getUserMock
      .mockResolvedValueOnce({
        data: {
          user: null,
        },
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            id: 'user-1',
            email_confirmed_at: '2026-02-11T21:00:00.000Z',
          },
        },
      });

    createMiddlewareClientMock.mockImplementationOnce(async () => {
      // Simulate middleware refresh call before route protection check.
      await getUserMock();
      return {
        supabase: {
          auth: {
            getUser: getUserMock,
          },
        },
        response: NextResponse.next(),
      };
    });

    const response = await middleware(request('http://localhost:3000/api/v1/upload'));

    expect(response.status).toBe(200);
    expect(getUserMock).toHaveBeenCalledTimes(2);
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
        email_confirmed_at: '2026-02-11T21:00:00.000Z',
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
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-02-11T21:00:00.000Z',
        },
      },
    });

    const response = await middleware(request('http://localhost:3000/auth/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/select-community');
  });

  it('redirects authenticated users to returnTo when present on auth pages', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-02-11T21:00:00.000Z',
        },
      },
    });

    const response = await middleware(
      request('http://localhost:3000/auth/login?returnTo=%2Fdocuments'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/documents');
  });

  it('keeps unverified users on verify-email route (no redirect loop)', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: null,
        },
      },
    });

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
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-02-11T21:00:00.000Z',
        },
      },
    });

    const response = await middleware(
      request('http://localhost:3000/communities/8/documents'),
    );

    expect(response.status).toBe(200);
  });
});
