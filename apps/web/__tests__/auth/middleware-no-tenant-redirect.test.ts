/**
 * Regression guard: authenticated users on protected paths without a resolved
 * community context must be redirected to /select-community.
 *
 * Background: Reserved subdomains (`www`, `app`, etc.) skip tenant resolution
 * in middleware. If a logged-in user lands on a protected path under one of
 * those hosts (e.g. https://www.getpropertypro.com/settings), no
 * `x-community-id` header is forwarded, so:
 *   - the app shell renders with `community: null`
 *   - every sidebar tab has `href={undefined}` (unclickable)
 *   - some pages (e.g. /settings) render placeholder body text instead of
 *     redirecting
 *
 * Fix: middleware now redirects authenticated users on protected non-API paths
 * to /select-community when no community context could be resolved. The
 * /select-community page itself (and PM routes) are carved out.
 */
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

function makeRequest(host: string, pathAndSearch: string, method: string = 'GET'): NextRequest {
  return new NextRequest(`https://${host}${pathAndSearch}`, {
    method,
    headers: {
      host,
      'x-real-ip': '203.0.113.42',
    },
  });
}

// createMiddlewareClient resolves the user itself (getClaims) and returns it
// directly — middleware no longer calls supabase.auth.getUser.
function mockAuthState(
  user: { id: string; emailVerified: boolean; email?: string | null } | null,
) {
  createMiddlewareClientMock.mockImplementation(async () => ({
    supabase: { auth: { getUser: getUserMock } },
    response: NextResponse.next(),
    user,
    authChecked: user != null,
  }));
}

describe('middleware: missing-tenant redirect for authenticated users on protected paths', () => {
  beforeEach(() => {
    resetGlobalRateLimiter();
    vi.clearAllMocks();

    mockAuthState({
      id: 'user-with-no-tenant-context',
      email: 'ruckus@example.com',
      emailVerified: true,
    });
  });

  afterEach(() => {
    resetGlobalRateLimiter();
  });

  it('redirects /settings on www.getpropertypro.com to /select-community', async () => {
    const response = await middleware(makeRequest('www.getpropertypro.com', '/settings'));

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const target = new URL(location!);
    expect(target.pathname).toBe('/select-community');
    expect(target.searchParams.get('returnTo')).toBe('/settings');
  });

  it('redirects /announcements on www. (preserving full returnTo with query string)', async () => {
    const response = await middleware(
      makeRequest('www.getpropertypro.com', '/announcements?filter=published'),
    );

    expect(response.status).toBe(307);
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe('/select-community');
    expect(target.searchParams.get('returnTo')).toBe('/announcements?filter=published');
  });

  it('redirects /audit-trail on the apex domain (no subdomain)', async () => {
    const response = await middleware(makeRequest('getpropertypro.com', '/audit-trail'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/select-community');
  });

  it('does NOT redirect /settings when ?communityId is present (header gets set from query)', async () => {
    const response = await middleware(
      makeRequest('www.getpropertypro.com', '/settings?communityId=282'),
    );

    expect(response.status).not.toBe(307);
  });

  it('does NOT redirect /dashboard on a community subdomain (header gets set from subdomain)', async () => {
    // Note: a community-subdomain request would normally hit the DB to resolve
    // the slug. We're only asserting that this case doesn't trip our new
    // redirect — slug resolution failures take their own 404 path.
    createMiddlewareClientMock.mockImplementation(async () => ({
      supabase: {
        auth: { getUser: getUserMock },
        from: () => ({
          select: () => ({
            eq: () => ({
              is: () => ({
                limit: async () => ({ data: [{ id: 282 }], error: null }),
              }),
            }),
          }),
        }),
      },
      response: NextResponse.next(),
      user: {
        id: 'user-with-no-tenant-context',
        email: 'ruckus@example.com',
        emailVerified: true,
      },
      authChecked: true,
    }));

    const response = await middleware(
      makeRequest('ruckus-test.getpropertypro.com', '/dashboard'),
    );

    expect(response.status).not.toBe(307);
  });

  it('does NOT redirect /pm/dashboard/communities on pm.getpropertypro.com (PM portfolio is cross-community)', async () => {
    const response = await middleware(
      makeRequest('pm.getpropertypro.com', '/pm/dashboard/communities'),
    );

    expect(response.status).not.toBe(307);
  });

  it('does NOT redirect /select-community itself (loop prevention)', async () => {
    const response = await middleware(makeRequest('www.getpropertypro.com', '/select-community'));

    expect(response.status).not.toBe(307);
  });

  it('does NOT bounce /account/join-community — the only escape route for a zero-community user', async () => {
    // A user whose every membership points at a soft-deleted community resolves
    // to zero communities and lands on /select-community's empty state. Its
    // call to action links here. Without the carve-out this path is bounced
    // straight back, so the button returns the user to the dead end it exists
    // to escape — a loop no timeout or retry can recover from.
    //
    // Control for this case is the first test in this file: /settings on the
    // same host, same auth state, MUST still bounce. If both go red the file is
    // broken; only this one going red is the real regression.
    const response = await middleware(
      makeRequest('www.getpropertypro.com', '/account/join-community'),
    );

    // Assert the redirect TARGET, not just the status, so a regression reports
    // the defect verbatim rather than a bare status mismatch.
    const location = response.headers.get('location');
    const bouncedTo = location ? new URL(location).pathname : null;
    expect(bouncedTo).not.toBe('/select-community');
    expect(response.status).not.toBe(307);
  });

  it('does NOT bounce /account/join-community on a COMMUNITY SUBDOMAIN, and resolves no tenant there', async () => {
    // The subdomain case is the one the first version of this fix got wrong.
    // Listing the path in the missing-tenant bounce alone was not enough: that
    // branch is gated on the tenant header being ABSENT, and a subdomain stamps
    // one. The layout then saw `community === null` with a tenant header and
    // redirected to /select-community — whose empty state links back here, so
    // the escape hatch looped forever. Only membership of TENANT_OPTIONAL_PATHS
    // in `shouldResolveTenant` stops the stamp, so that is what this asserts.
    //
    // rpc, not from(): findCommunityIdBySlug calls
    // supabase.rpc('pp_public_community_id_by_slug'). Mocking the from() chain
    // instead (as the /dashboard case above does) leaves rpc undefined, the
    // call throws, and middleware returns 500 — which would satisfy a lone
    // `not.toBe(307)` while proving nothing. Asserting rpc was NOT called is
    // the real evidence that tenant resolution was skipped rather than failed.
    const rpcMock = vi.fn(async () => ({ data: 282, error: null }));
    createMiddlewareClientMock.mockImplementation(async () => ({
      supabase: { auth: { getUser: getUserMock }, rpc: rpcMock },
      response: NextResponse.next(),
      user: {
        id: 'user-with-no-live-communities',
        email: 'ruckus@example.com',
        emailVerified: true,
      },
      authChecked: true,
    }));

    const response = await middleware(
      makeRequest('ruckus-test.getpropertypro.com', '/account/join-community'),
    );

    // 1. Not bounced.
    const location = response.headers.get('location');
    const bouncedTo = location ? new URL(location).pathname : null;
    expect(bouncedTo).not.toBe('/select-community');
    expect(response.status).not.toBe(307);

    // 2. No tenant stamped — this is what keeps the authenticated layout from
    //    bouncing us. Next surfaces forwarded request headers on the response
    //    under the x-middleware-request- prefix.
    expect(response.headers.get('x-middleware-request-x-community-id')).toBeNull();

    // 3. The slug was never even looked up.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('does NOT redirect API requests — handlers throw their own ValidationError', async () => {
    const response = await middleware(makeRequest('www.getpropertypro.com', '/api/v1/announcements'));

    // Either 200/whatever the next handler returns, or 401 from the auth check,
    // but NOT a redirect — clients shouldn't follow redirects on API routes.
    expect(response.status).not.toBe(307);
  });

  it('redirects unauthenticated users to /auth/login first (no missing-tenant detour)', async () => {
    // When the user isn't logged in at all, the existing auth redirect wins —
    // we don't want to leak the existence of /select-community to anonymous
    // visitors via a redirect chain.
    mockAuthState(null);

    const response = await middleware(makeRequest('www.getpropertypro.com', '/settings'));

    expect(response.status).toBe(307);
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe('/auth/login');
  });

  it('redirects email-unverified users to /auth/verify-email first (ordering guard)', async () => {
    // The verify-email guard sits above the new missing-tenant redirect in the
    // ladder. An authenticated-but-unverified user hitting a protected path on
    // www. must land on /auth/verify-email, NOT /select-community — otherwise
    // the picker would render an unverified session.
    mockAuthState({
      id: 'unverified-user',
      email: 'unverified@example.com',
      emailVerified: false,
    });

    const response = await middleware(makeRequest('www.getpropertypro.com', '/settings'));

    expect(response.status).toBe(307);
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe('/auth/verify-email');
  });
});
