/**
 * Regression guard: a foreign (custom-domain) host must never have its first
 * label read as a PropertyPro tenant slug.
 *
 * `resolveCommunityContext` only classifies a host as `custom_domain` when it
 * is given `rootDomain` — that is what `foreignHost()` compares against. The
 * `pathname === '/'` and `/transparency` branches passed it; the
 * protected-route and `/auth/*` branches did NOT. On those two, a foreign host
 * fell through to the subdomain path and `parseHostSubdomain()` returned its
 * first label as a tenant slug. So:
 *
 *   sunset-condos.example.com/dashboard
 *     → source 'host_subdomain', tenantSlug 'sunset-condos'
 *     → findCommunityIdBySlug('sunset-condos') resolves the REAL community
 *     → x-community-id forwarded off a host we do not control
 *
 * Membership checks downstream still gated the data, but tenant context must
 * not be resolvable off a foreign host at all.
 *
 * NOTE ON SCOPE: these tests assert that a custom host resolves NOTHING on
 * these two surfaces and cleanly falls through to the missing-tenant redirect.
 * That is deliberate, not a gap — per design decision D4 a custom domain
 * serves the public `/` site only, residents authenticate on the subdomain,
 * and "Custom domain on /auth/* and /dashboard" is an explicit non-goal. A
 * foreign host also never carries a PropertyPro session (auth cookies are
 * pinned to `.getpropertypro.com`, which a browser on another origin rejects),
 * so a resolution branch here could never succeed anyway. See
 * docs/superpowers/specs/2026-06-03-custom-domain-support-design.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { resetGlobalRateLimiter } from '../../src/lib/middleware/rate-limiter';

const { createMiddlewareClientMock, communityRowsMock } = vi.hoisted(() => ({
  createMiddlewareClientMock: vi.fn(),
  communityRowsMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { middleware } from '../../src/middleware';

function makeRequest(host: string, pathAndSearch: string): NextRequest {
  return new NextRequest(`https://${host}${pathAndSearch}`, {
    method: 'GET',
    headers: { host, 'x-real-ip': '203.0.113.42' },
  });
}

/**
 * Minimal PostgREST-style builder. Records the `.eq()`/`.is()` filters so a
 * test can assert WHICH lookup ran (or that none ran), and resolves whatever
 * `communityRowsMock` returns for those filters.
 */
function makeSupabaseStub() {
  return {
    auth: { getUser: vi.fn() },
    from(_table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        is: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        limit: () => Promise.resolve({ data: communityRowsMock(filters), error: null }),
      };
      return builder;
    },
  };
}

function mockAuthState(user: { id: string; emailVerified: boolean; email?: string | null } | null) {
  createMiddlewareClientMock.mockImplementation(async () => ({
    supabase: makeSupabaseStub(),
    response: NextResponse.next(),
    user,
    authChecked: user != null,
  }));
}

/**
 * The filter objects of every lookup the middleware issued against `column`.
 * `mock.calls` holds argument ARRAYS, so unwrap the single argument — asserting
 * on the raw calls compares `[[filters]]`, which no readable matcher fits.
 */
function lookupsBy(column: string): Array<Record<string, unknown>> {
  return communityRowsMock.mock.calls
    .map(([filters]) => filters as Record<string, unknown>)
    .filter((filters) => column in filters);
}

/**
 * Slugs that resolve, so a misresolution shows up as a REAL community id
 * rather than an empty result.
 *
 * Each test uses its own slug on purpose: middleware's tenant cache is
 * module-level and keyed by SLUG, so a shared slug lets one test's cached
 * result satisfy (or break) another's assertions depending on order. An
 * earlier draft of this file had exactly that bug in two places.
 */
const RESOLVABLE_SLUGS: Record<string, number> = {
  'sunset-condos': 1,
  'palm-shores': 2,
  'sunset-ridge': 3,
};

describe('middleware: a foreign host never resolves a tenant slug', () => {
  beforeEach(() => {
    resetGlobalRateLimiter();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'getpropertypro.com';
    mockAuthState({ id: 'user-on-custom-domain', email: 'ruckus@example.com', emailVerified: true });
    communityRowsMock.mockImplementation((filters: Record<string, unknown>) => {
      const id = RESOLVABLE_SLUGS[String(filters.slug)];
      return id ? [{ id }] : [];
    });
  });

  afterEach(() => {
    resetGlobalRateLimiter();
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });

  it('does not resolve a real community when a foreign sub-host collides with its slug', async () => {
    const response = await middleware(makeRequest('sunset-condos.example.com', '/dashboard'));

    // The real bug: this used to forward x-community-id: 1.
    expect(response.headers.get('x-middleware-request-x-community-id')).toBeNull();
    expect(lookupsBy('slug')).toEqual([]);
  });

  it('does not resolve a real community on a foreign host for /auth/* either', async () => {
    // Must be UNAUTHENTICATED: middleware redirects a logged-in user away from
    // auth pages, and a redirect response carries no forwarded request headers
    // — so an authenticated actor would make this assertion pass even on the
    // pre-fix code, for reasons unrelated to what is under test.
    mockAuthState(null);

    const response = await middleware(makeRequest('palm-shores.example.com', '/auth/login'));

    expect(response.headers.get('x-middleware-request-x-community-id')).toBeNull();
    expect(lookupsBy('slug')).toEqual([]);
  });

  it('bounces a protected path on an apex custom host to /select-community', async () => {
    const response = await middleware(makeRequest('apexhoa.example.com', '/dashboard'));

    expect(response.status).toBe(307);
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe('/select-community');
  });

  it('issues no community lookup at all for a foreign host on a protected path', async () => {
    // D4: a custom domain serves the public `/` site only, so this surface has
    // nothing to resolve — and must not spend a DB round-trip discovering that.
    await middleware(makeRequest('portal.example.com', '/dashboard'));

    expect(communityRowsMock).not.toHaveBeenCalled();
  });

  it('does not regress *.getpropertypro.com subdomain resolution', async () => {
    const response = await middleware(
      makeRequest('sunset-ridge.getpropertypro.com', '/dashboard'),
    );

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-community-id')).toBe('3');
    expect(lookupsBy('slug')).toEqual([expect.objectContaining({ slug: 'sunset-ridge' })]);
  });

  it('does not regress ?communityId= resolution on the canonical www host', async () => {
    const response = await middleware(
      makeRequest('www.getpropertypro.com', '/dashboard?communityId=134'),
    );

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-community-id')).toBe('134');
  });
});
