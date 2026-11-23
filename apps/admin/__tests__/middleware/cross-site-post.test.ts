/**
 * Cross-site API writes are refused at the admin middleware.
 *
 * The admin session cookie is SameSite=Lax, and Lax is SITE-scoped: every
 * `*.getpropertypro.com` host (tenant, demo and public-site subdomains) is the
 * same site as `admin.getpropertypro.com`, so a form posted from one of them
 * carries the cookie. Several admin routes accept a POST with no body, so the
 * JSON content-type check in `parseJsonBody` does not stand in the way either.
 *
 * The browser says where a request came from in `Sec-Fetch-Site`. Anything
 * other than `same-origin` is refused. A request WITHOUT the header passes:
 * server-to-server callers (the push-dispatch cron) and older browsers do not
 * send it, and SameSite still applies to them.
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

const { createMiddlewareClientMock } = vi.hoisted(() => ({
  createMiddlewareClientMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminDb),
}));

function request(
  pathname: string,
  { method = 'POST', secFetchSite }: { method?: string; secFetchSite?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (secFetchSite !== undefined) headers.set('sec-fetch-site', secFetchSite);
  return new NextRequest(new URL(`https://admin.getpropertypro.com${pathname}`), {
    method,
    headers,
  });
}

const RETRY_PATH = '/api/admin/health/jobs/some-job/retry';

describe('admin middleware — cross-site API writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No session: a request that reaches the normal auth path answers 307 to
    // the login page, which is how the pass-through cases below are told apart
    // from the 403 refusal.
    createMiddlewareClientMock.mockResolvedValue({
      supabase: { auth: { getUser: vi.fn() } },
      response: { headers: new Headers(), status: 200 },
      user: null,
      authChecked: false,
    });
  });

  it('same-site POST from a tenant subdomain is refused', async () => {
    const { middleware } = await import('@/middleware');
    const res = await middleware(request(RETRY_PATH, { secFetchSite: 'same-site' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: 'FORBIDDEN', message: 'Cross-site request refused' },
    });
    // Refused before any session work.
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
  });

  it('cross-site POST is refused', async () => {
    const { middleware } = await import('@/middleware');
    const res = await middleware(
      request('/api/admin/preferences/read-all', { secFetchSite: 'cross-site' }),
    );

    expect(res.status).toBe(403);
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
  });

  it('same-origin POST passes through to the normal auth path', async () => {
    const { middleware } = await import('@/middleware');
    const res = await middleware(request(RETRY_PATH, { secFetchSite: 'same-origin' }));

    expect(res.status).toBe(307);
    expect(res.headers.get('location') ?? '').toContain('/auth/login');
    expect(createMiddlewareClientMock).toHaveBeenCalledTimes(1);
  });

  it('POST with no sec-fetch-site passes through (server-to-server cron)', async () => {
    const { middleware } = await import('@/middleware');
    const res = await middleware(request('/api/admin/internal/push-dispatch'));

    // The internal prefix skips the session gate; the route's own
    // requireCronSecret answers the caller.
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(307);
    expect(createMiddlewareClientMock).toHaveBeenCalledTimes(1);
  });

  it('GET is never refused', async () => {
    const { middleware } = await import('@/middleware');
    for (const secFetchSite of ['same-site', 'cross-site', 'none']) {
      const res = await middleware(
        request('/api/admin/preferences', { method: 'GET', secFetchSite }),
      );
      expect(res.status, `GET with sec-fetch-site: ${secFetchSite}`).toBe(307);
    }
  });
});
