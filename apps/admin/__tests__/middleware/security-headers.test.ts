/**
 * P1-3: the admin console must serve security headers on EVERY response.
 *
 * Before this landed it served none at all — no CSP, no X-Frame-Options, no
 * nosniff — on any path. The middleware has five distinct exit points and the
 * realistic failure mode is not "headers are wrong", it is "one exit point was
 * missed". Each test below drives a DIFFERENT exit and asserts the same
 * baseline, so adding a sixth un-wrapped return breaks a test here.
 *
 * Exits covered:
 *  1. public path            (/auth/login)
 *  2. authorized page        (/clients, admin row present)
 *  3. auth redirect, no user (307 -> /auth/login)
 *  4. auth redirect, non-admin (307 -> access_denied)
 *  5. rate-limit             (429 on /api/*)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

/** Headers that must be present on every single admin response. */
function expectBaselineHeaders(res: Response) {
  expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
  expect(res.headers.get('X-DNS-Prefetch-Control')).toBe('off');
}

async function runMiddleware(url: string, headers?: Record<string, string>) {
  const { middleware } = await import('@/middleware');
  return middleware(new NextRequest(url, headers ? { headers } : undefined));
}

function asAdmin() {
  middlewareUser = { id: 'admin-uuid', email: 'admin@getpropertypro.com', emailVerified: true };
  mockSingle.mockResolvedValue({ data: { user_id: 'admin-uuid' } });
}

describe('admin security headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules(); // reset the in-memory rate-limit store between tests
    middlewareUser = null;
  });

  // --- Exit 1: public path -------------------------------------------------
  it('sets security headers on a public path', async () => {
    const res = await runMiddleware('http://admin.getpropertypro.com/auth/login');

    expectBaselineHeaders(res);
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  // --- Exit 2: authorized page ---------------------------------------------
  it('sets security headers on an authorized page response', async () => {
    asAdmin();
    const res = await runMiddleware('http://admin.getpropertypro.com/clients');

    expectBaselineHeaders(res);
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  // --- Exit 3: redirect, unauthenticated -----------------------------------
  it('sets security headers on the unauthenticated redirect', async () => {
    middlewareUser = null;
    const res = await runMiddleware('http://admin.getpropertypro.com/clients');

    expect(res.status).toBe(307);
    expectBaselineHeaders(res);
  });

  // --- Exit 4: redirect, authenticated but not a platform admin -------------
  it('sets security headers on the access-denied redirect', async () => {
    middlewareUser = { id: 'regular-user', email: 'user@example.com', emailVerified: true };
    mockSingle.mockResolvedValue({ data: null });

    const res = await runMiddleware('http://admin.getpropertypro.com/clients');

    expect(res.status).toBe(307);
    expect(res.headers.get('location') ?? '').toContain('access_denied');
    expectBaselineHeaders(res);
  });

  // --- Exit 5: rate limit --------------------------------------------------
  it('sets security headers on the 429 rate-limit response', async () => {
    asAdmin();
    const ip = { 'x-forwarded-for': '203.0.113.9' };
    const url = 'http://admin.getpropertypro.com/api/admin/stats';

    let res: Response | undefined;
    // The limiter allows 100/min; the 101st must be refused.
    for (let i = 0; i < 101; i++) {
      res = await runMiddleware(url, ip);
    }

    expect(res!.status).toBe(429);
    expectBaselineHeaders(res!);
  });

  // --- Exit 6: the handler throws ------------------------------------------
  it('sets security headers even when the handler throws', async () => {
    // createAdminClient() throws on a missing service-role key, among others.
    // Next's built-in middleware-error response carries no headers at all.
    middlewareUser = { id: 'admin-uuid', email: 'a@b.com', emailVerified: true };
    mockSingle.mockRejectedValue(new Error('SUPABASE_SERVICE_ROLE_KEY is not set'));

    const res = await runMiddleware('http://admin.getpropertypro.com/clients');

    expect(res.status).toBe(500);
    expectBaselineHeaders(res);
  });

  // --- CSP shape -----------------------------------------------------------
  it('omits CSP on API responses but keeps the baseline headers', async () => {
    asAdmin();
    const res = await runMiddleware('http://admin.getpropertypro.com/api/admin/stats', {
      'x-forwarded-for': '198.51.100.7',
    });

    expectBaselineHeaders(res);
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('allows framing the web app for demo previews', async () => {
    asAdmin();
    const res = await runMiddleware('http://admin.getpropertypro.com/demo/1/preview');
    const csp = res.headers.get('Content-Security-Policy') ?? '';

    // Per-demo subdomains (https://<slug>.getpropertypro.com) are framed by the
    // preview page, so the wildcard must be present in frame-src.
    expect(csp).toContain('frame-src');
    expect(csp).toContain('https://*.getpropertypro.com');
  });

  // --- PWA (task 30) -------------------------------------------------------
  //
  // Four static, secret-free URLs that the browser fetches WITHOUT a usable
  // session: the worker's own script (re-fetched on the browser's update
  // schedule, including after the session expires), the manifest and its icons
  // (fetched on the login page, which is where installability is decided), and
  // the offline fallback (precached by a registration that also runs on the
  // login page). Each of them is BROKEN by a 307 to an HTML login page rather
  // than merely delayed by it.
  it.each(['/sw.js', '/manifest.webmanifest', '/offline', '/icons/icon-192.png'])(
    'serves %s without an admin session',
    async (path) => {
      middlewareUser = null;
      const res = await runMiddleware(`http://admin.getpropertypro.com${path}`);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      // The public branch returns before the service-role lookup, so an
      // anonymous icon request cannot cost a platform_admin_users query.
      expect(mockSingle).not.toHaveBeenCalled();
      expectBaselineHeaders(res);
    },
  );

  it('registers a service worker and loads a manifest under the CSP it serves', async () => {
    asAdmin();
    const res = await runMiddleware('http://admin.getpropertypro.com/clients');
    const csp = res.headers.get('Content-Security-Policy') ?? '';

    // Registering /sw.js needs worker-src; the manifest link needs manifest-src.
    // manifest-src would fall back to default-src today, and is pinned anyway
    // so that widening default-src later cannot silently widen it too.
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("manifest-src 'self'");
  });

  it('does not permit unsafe-eval outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    asAdmin();
    const res = await runMiddleware('http://admin.getpropertypro.com/clients');

    expect(res.headers.get('Content-Security-Policy') ?? '').not.toContain("'unsafe-eval'");
    vi.unstubAllEnvs();
  });
});
