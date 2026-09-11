/**
 * The `/api/admin/internal/` middleware exemption, and its TIGHTNESS.
 *
 * This is the only prefix rule on a console that holds the service-role key.
 * The file's own comment refuses prefix matching for `/api/health` precisely
 * because a prefix silently adopts every future sibling path, so the rule that
 * replaced it has to be pinned in both directions:
 *
 * - a path UNDER the prefix reaches its route with no session, so the cron can
 *   authenticate with its bearer instead;
 * - a path that merely STARTS WITH the same characters does not.
 *
 * The second half is the one a regression would silently pass: dropping the
 * trailing slash still lets the cron through, and the only visible difference
 * is that `/api/admin/internal-anything` is now unauthenticated too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockSingleFrom = vi.fn();
const mockAdminDb = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockSingleFrom,
      })),
    })),
  })),
};

let middlewareUser: { id: string; email: string | null; emailVerified: boolean } | null = null;

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn(async () => ({
    supabase: { auth: { getUser: vi.fn() } },
    response: { headers: new Headers(), status: 200 },
    user: middlewareUser,
    authChecked: middlewareUser != null,
  })),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminDb),
}));

function request(pathname: string, method = 'POST'): NextRequest {
  return new NextRequest(new URL(`http://admin.getpropertypro.com${pathname}`), { method });
}

describe('admin middleware — /api/admin/internal/ exemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The state that matters: NO session at all, which is what Vercel Cron has.
    middlewareUser = null;
  });

  it('lets an unauthenticated POST under the prefix reach its route', async () => {
    const { middleware } = await import('@/middleware');
    const res = await middleware(request('/api/admin/internal/push-dispatch'));

    // Not a redirect to the login page — the route itself answers, and its own
    // requireCronSecret is what refuses an anonymous caller (see push-routes).
    expect(res.status).not.toBe(307);
    expect(mockAdminDb.from).not.toHaveBeenCalled();
  });

  it('lets a GET under the prefix through too — Vercel Cron issues GET', async () => {
    const { middleware } = await import('@/middleware');
    const res = await middleware(request('/api/admin/internal/push-dispatch', 'GET'));
    expect(res.status).not.toBe(307);
  });

  it('does NOT exempt a sibling path that merely shares the prefix string', async () => {
    const { middleware } = await import('@/middleware');

    for (const path of [
      '/api/admin/internal-tools',
      '/api/admin/internalreports',
      '/api/admin/internal',
    ]) {
      const res = await middleware(request(path));
      expect(res.status, `${path} must still require a session`).toBe(307);
      expect(res.headers.get('location') ?? '').toContain('/auth/login');
    }
  });

  it('still requires a session for an ordinary admin API route', async () => {
    const { middleware } = await import('@/middleware');
    const res = await middleware(request('/api/admin/preferences', 'GET'));
    expect(res.status).toBe(307);
  });
});
