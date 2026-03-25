import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware auth-split test — verifies the public site routing logic.
 *
 * The middleware must:
 * 1. When a community subdomain requests '/' and user is NOT authenticated,
 *    let the request through to the public site with community headers.
 * 2. When a community subdomain requests '/' and user IS authenticated,
 *    redirect to /dashboard.
 * 3. When no community context on '/', pass through normally (marketing page).
 */

// Mock dependencies before importing middleware
const {
  mockGetUser,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn().mockImplementation(async () => {
    const supabase = {
      auth: { getUser: mockGetUser },
      from: mockSupabaseFrom,
    };
    return { supabase, response: NextResponse.next() };
  }),
}));

vi.mock('@propertypro/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@propertypro/shared')>();
  return {
    ...actual,
    resolveCommunityContext: vi.fn().mockImplementation(({ host }: { host: string | null }) => {
    // Simulate subdomain resolution
    if (host && host.startsWith('sunset-condos.')) {
      return {
        source: 'host_subdomain' as const,
        communityId: null,
        tenantSlug: 'sunset-condos',
        isReservedSubdomain: false,
      };
    }
    if (host === 'pm.propertyprofl.com') {
      return {
        source: 'host_subdomain' as const,
        communityId: null,
        tenantSlug: 'pm',
        isReservedSubdomain: true,
      };
    }
    return {
      source: 'none' as const,
      communityId: null,
      tenantSlug: null,
      isReservedSubdomain: false,
    };
  }),
  };
});

vi.mock('../../src/lib/middleware/rate-limit-config', () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
  rateLimitedResponse: vi.fn(),
  classifyRoute: vi.fn().mockReturnValue('public'),
}));

vi.mock('../../src/lib/support/impersonation', () => ({
  parseImpersonationCookie: vi.fn().mockResolvedValue(null),
  isReadOnlyBlocked: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/lib/middleware/security-headers', () => ({
  isAllowedOrigin: vi.fn().mockReturnValue(false),
  buildCorsHeaders: vi.fn().mockReturnValue({}),
  buildSecurityHeaders: vi.fn().mockReturnValue({}),
  buildCspHeader: vi.fn().mockReturnValue(''),
}));

import { middleware } from '../../src/middleware';

function createRequest(
  url: string,
  options?: { host?: string; headers?: Record<string, string> },
): NextRequest {
  const req = new NextRequest(url, {
    headers: {
      host: options?.host ?? 'localhost:3000',
      ...options?.headers,
    },
  });
  return req;
}

describe('public site auth-split middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no user
    mockGetUser.mockResolvedValue({ data: { user: null } });
    // Default: slug lookup returns community ID
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          is: () => ({
            limit: () =>
              Promise.resolve({ data: [{ id: 42 }], error: null }),
          }),
        }),
      }),
    });
  });

  it('lets unauthenticated user through to public site on community subdomain root', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = createRequest('http://sunset-condos.propertyprofl.com/', {
      host: 'sunset-condos.propertyprofl.com',
    });

    const response = await middleware(request);

    // Should pass through (not redirect)
    expect(response.status).toBe(200);
    // Should have community headers forwarded
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
  });

  it('redirects authenticated user to /dashboard on community subdomain root', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
        },
      },
    });

    const request = createRequest('http://sunset-condos.propertyprofl.com/', {
      host: 'sunset-condos.propertyprofl.com',
    });

    const response = await middleware(request);

    expect(response.status).toBe(307);
    const locationUrl = new URL(response.headers.get('location') ?? '');
    expect(locationUrl.pathname).toBe('/dashboard');
  });

  it('keeps authenticated user on public site when preview=true is present', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
        },
      },
    });

    const request = createRequest('http://sunset-condos.propertyprofl.com/?preview=true', {
      host: 'sunset-condos.propertyprofl.com',
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('passes through normally on root path without community context', async () => {
    const request = createRequest('http://localhost:3000/', {
      host: 'localhost:3000',
    });

    const response = await middleware(request);

    // Should pass through without redirect (marketing page)
    expect(response.status).toBe(200);
  });

  it('does not interfere with reserved subdomain handling', async () => {
    // Reserved subdomains on '/' should not trigger public site logic
    const request = createRequest('http://pm.propertyprofl.com/', {
      host: 'pm.propertyprofl.com',
    });

    const response = await middleware(request);

    // Should pass through (hasCommunityContext is false due to reserved subdomain)
    expect(response.status).toBe(200);
  });

  it('does not affect protected paths like /dashboard', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = createRequest('http://sunset-condos.propertyprofl.com/dashboard', {
      host: 'sunset-condos.propertyprofl.com',
    });

    const response = await middleware(request);

    // Unauthenticated user on /dashboard should be redirected to /auth/login
    expect(response.status).toBe(307);
    const locationUrl = new URL(response.headers.get('location') ?? '');
    expect(locationUrl.pathname).toBe('/auth/login');
  });
});
