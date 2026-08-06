/**
 * Admin middleware AUTHORIZATION — the platform_admin_users gate.
 *
 * Renamed from `cross-subdomain-session.test.ts` on 2026-08-05. Under that name
 * it read as the regression test for the production cookie incident, and the
 * audit (P2-12) flagged that it tested none of it: it mocks
 * `createMiddlewareClient` wholesale, so cookie name, `domain` and `secure`
 * never enter the picture.
 *
 * That finding is discharged by `cookie-config.test.ts`, which asserts the
 * cookie options directly — including the exact production configuration the
 * incident occurred in (`NODE_ENV=production` with `NEXT_PUBLIC_COOKIE_DOMAIN`
 * empty). Look there for cookie behaviour.
 *
 * What THIS file covers, and covers well, is the authorization gate:
 * a platform-admin row lets the request through, a missing row redirects with
 * `access_denied`, and an unauthenticated request redirects to login WITHOUT
 * making the service-role query at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockSingle = vi.fn();
const mockAdminDb = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockSingle,
      })),
    })),
  })),
};

// createMiddlewareClient resolves the user itself (getClaims) and returns it
// directly — the admin middleware no longer calls supabase.auth.getUser.
// Tests set `middlewareUser` to control the authenticated identity.
let middlewareUser: { id: string; email: string | null; emailVerified: boolean } | null = null;

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn(async () => ({
    supabase: { auth: { getUser: mockGetUser } },
    response: { headers: new Headers(), status: 200 },
    user: middlewareUser,
    authChecked: middlewareUser != null,
  })),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminDb),
}));

describe('cross-subdomain session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    middlewareUser = null;
  });

  it('accepts session from a platform_admin_users member', async () => {
    const adminUserId = 'platform-admin-uuid';
    middlewareUser = {
      id: adminUserId,
      email: 'admin@getpropertypro.com',
      emailVerified: true,
    };
    mockSingle.mockResolvedValue({ data: { user_id: adminUserId } });

    const { middleware } = await import('@/middleware');
    const req = new NextRequest('http://admin.getpropertypro.com/clients');
    const res = await middleware(req);

    // Should not redirect to login
    expect(res.status).not.toBe(307);
    expect(mockSingle).toHaveBeenCalledOnce();
  });

  it('rejects session for user not in platform_admin_users', async () => {
    const nonAdminId = 'regular-user-uuid';
    middlewareUser = {
      id: nonAdminId,
      email: 'user@sunset-condos.getpropertypro.com',
      emailVerified: true,
    };
    mockSingle.mockResolvedValue({ data: null }); // No platform_admin_users row

    const { middleware } = await import('@/middleware');
    const req = new NextRequest('http://admin.getpropertypro.com/clients');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('access_denied');
  });

  it('rejects request with no session at all', async () => {
    middlewareUser = null;

    const { middleware } = await import('@/middleware');
    const req = new NextRequest('http://admin.getpropertypro.com/clients');
    const res = await middleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    // Should not have checked platform_admin_users since there's no session
    expect(mockSingle).not.toHaveBeenCalled();
  });
});
