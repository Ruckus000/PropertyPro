import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware public-site routing test.
 *
 * The middleware must:
 * 1. On a community subdomain, rewrite '/' to the public site with community
 *    headers — for EVERY visitor, signed in or not.
 * 2. When there is no community context on '/', pass through normally
 *    (marketing page).
 *
 * There is no auth split here any more. Until 11b-0 an authenticated visitor
 * was redirected to /dashboard; that was tolerable while the public site was a
 * single page and wrong once it owned real URLs, so it was removed. The test at
 * 'serves the public site to an AUTHENTICATED visitor on the subdomain root' is
 * the assertion that it stays removed.
 */

// Mock dependencies before importing middleware.
// createMiddlewareClient resolves the user itself (getClaims) and returns it
// directly — middleware no longer calls supabase.auth.getUser. Tests set
// authState.user to control the authenticated identity.
const {
  authState,
  mockGetUser,
  mockSupabaseFrom,
  mockSupabaseRpc,
} = vi.hoisted(() => ({
  authState: {
    user: null as { id: string; email?: string | null; emailVerified: boolean } | null,
  },
  mockGetUser: vi.fn(),
  mockSupabaseFrom: vi.fn(),
  mockSupabaseRpc: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn().mockImplementation(async () => {
    const supabase = {
      auth: { getUser: mockGetUser },
      from: mockSupabaseFrom,
      rpc: mockSupabaseRpc,
    };
    return {
      supabase,
      response: NextResponse.next(),
      user: authState.user,
      authChecked: authState.user != null,
    };
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
    if (host === 'pm.getpropertypro.com') {
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

describe('public site root rewrite middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no user
    authState.user = null;
    // Default: slug lookup resolves to a community id.
    //
    // Via the pp_public_community_id_by_slug RPC (migration 0045), not a direct
    // read of `communities`: this client carries the ANON key, and
    // pp_communities_select requires a membership an anonymous visitor does not
    // have — so the direct read matched zero rows and every public site
    // rendered "Community not found." behind an HTTP 200.
    mockSupabaseRpc.mockResolvedValue({ data: 42, error: null });
  });

  it('lets unauthenticated user through to public site on community subdomain root', async () => {
    authState.user = null;

    const request = createRequest('http://sunset-condos.getpropertypro.com/', {
      host: 'sunset-condos.getpropertypro.com',
    });

    const response = await middleware(request);

    // Should pass through (not redirect)
    expect(response.status).toBe(200);
    // Should have community headers forwarded
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
  });

  it('serves the public site to an AUTHENTICATED visitor on the subdomain root', async () => {
    // Changed by 11b-0. This used to 307 to /dashboard. With the public site
    // owning real URLs, that made every shared link useless for exactly the
    // people most likely to be signed in — a resident following a link to their
    // own community's website landed on the app instead of the page.
    authState.user = {
      id: 'user-1',
      email: 'test@example.com',
      emailVerified: true,
    };

    const request = createRequest('http://sunset-condos.getpropertypro.com/', {
      host: 'sunset-condos.getpropertypro.com',
    });

    const response = await middleware(request);

    expect(response.headers.get('location')).toBeNull();
    const rewrite = response.headers.get('x-middleware-rewrite');
    expect(new URL(rewrite ?? '').pathname).toBe('/public-site');
  });

  it('keeps authenticated user on public site when preview=true is present', async () => {
    authState.user = {
      id: 'user-1',
      email: 'test@example.com',
      emailVerified: true,
    };

    const request = createRequest('http://sunset-condos.getpropertypro.com/?preview=true', {
      host: 'sunset-condos.getpropertypro.com',
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
    const request = createRequest('http://pm.getpropertypro.com/', {
      host: 'pm.getpropertypro.com',
    });

    const response = await middleware(request);

    // Should pass through (hasCommunityContext is false due to reserved subdomain)
    expect(response.status).toBe(200);
  });

  it('does not affect protected paths like /dashboard', async () => {
    authState.user = null;

    const request = createRequest('http://sunset-condos.getpropertypro.com/dashboard', {
      host: 'sunset-condos.getpropertypro.com',
    });

    const response = await middleware(request);

    // Unauthenticated user on /dashboard should be redirected to /auth/login
    expect(response.status).toBe(307);
    const locationUrl = new URL(response.headers.get('location') ?? '');
    expect(locationUrl.pathname).toBe('/auth/login');
  });
});
