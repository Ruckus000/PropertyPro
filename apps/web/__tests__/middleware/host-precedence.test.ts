/**
 * 11b-0 — host precedence, driven through the real `middleware()` export.
 *
 * The matrix: {app host, community subdomain, verified custom domain} ×
 * {protected path, public path, api path} × {authenticated, anonymous}.
 *
 * **The loudest assertion in this file is that no app route becomes reachable
 * without auth on the app host.** That is the regression this phase risks, and
 * it is asserted first and per-path rather than as a single spot check.
 *
 * The second-loudest is that a community SUBDOMAIN still serves the app.
 * `community-tenant-host-precedence.spec.ts` loads `/dashboard` on a subdomain
 * and expects the dashboard, so granting host precedence there would break
 * every resident — that is precisely the mistake this file exists to catch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ROOT_DOMAIN = 'getpropertypro.com';
const CUSTOM_HOST = 'www.sunsetcondos.com';

const { getUserMock, rpcMock, captureMessageMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  captureMessageMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureMessage: captureMessageMock }));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: () => ({
    supabase: {
      auth: { getUser: getUserMock, getClaims: getUserMock },
      rpc: rpcMock,
    },
    response: NextResponse.next(),
  }),
}));

// Rate limiting is orthogonal here and its state leaks across cases.
vi.mock('@/lib/middleware/rate-limit-config', () => ({
  checkRateLimit: () => null,
  rateLimitedResponse: () => NextResponse.json({ error: 'rate' }, { status: 429 }),
  classifyRoute: () => 'read',
}));

vi.mock('@/lib/support/impersonation', () => ({
  resolveActiveSupportSession: vi.fn().mockResolvedValue(null),
  isReadOnlyBlocked: () => false,
}));

import { middleware } from '@/middleware';

/** Builds a request for `host` + `path`, with the auth cookie when signed in. */
function request(host: string, path: string): NextRequest {
  // A real NextRequest — a cast Request has no `nextUrl` and middleware
  // destructures it on the first line.
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

function signedIn(is: boolean) {
  getUserMock.mockResolvedValue(
    is
      ? { data: { user: { id: 'u1', email: 'a@b.c' }, claims: { sub: 'u1' } }, error: null }
      : { data: { user: null, claims: null }, error: null },
  );
}

/** Where did middleware send this request? */
function outcome(res: NextResponse) {
  const location = res.headers.get('location');
  const rewrite = res.headers.get('x-middleware-rewrite');
  if (location) return { kind: 'redirect' as const, to: new URL(location).pathname };
  if (rewrite) return { kind: 'rewrite' as const, to: new URL(rewrite).pathname };
  return { kind: 'next' as const, to: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NEXT_PUBLIC_ROOT_DOMAIN'] = ROOT_DOMAIN;
  signedIn(false);
  // Any custom-domain lookup resolves to community 7.
  rpcMock.mockResolvedValue({ data: 7, error: null });
});

const PROTECTED_PATHS = ['/dashboard', '/documents', '/settings', '/payments'];

describe('app host — auth is never weakened', () => {
  it.each(PROTECTED_PATHS)(
    'still redirects anonymous %s on the app host to login',
    async (path) => {
      const res = await middleware(request(`app.${ROOT_DOMAIN}`, path));
      const got = outcome(res);
      expect(got.kind, `${path} must not be served anonymously`).toBe('redirect');
      expect(got.to).toBe('/auth/login');
    },
  );

  it.each(PROTECTED_PATHS)(
    'never rewrites %s on the app host to the public site',
    async (path) => {
      signedIn(true);
      const res = await middleware(request(`app.${ROOT_DOMAIN}`, path));
      expect(outcome(res).to ?? '').not.toContain('/public-site');
    },
  );

  it('returns 401 rather than a redirect for an anonymous API call', async () => {
    const res = await middleware(request(`app.${ROOT_DOMAIN}`, '/api/v1/documents'));
    expect(res.status).toBe(401);
  });
});

describe('community subdomain — still the app', () => {
  it.each(PROTECTED_PATHS)(
    'keeps %s as an app route, not a public page',
    async (path) => {
      signedIn(true);
      const res = await middleware(request(`sunset-condos.${ROOT_DOMAIN}`, path));
      expect(outcome(res).to ?? '').not.toContain('/public-site');
    },
  );

  it.each(PROTECTED_PATHS)('still gates %s behind auth', async (path) => {
    const res = await middleware(request(`sunset-condos.${ROOT_DOMAIN}`, path));
    const got = outcome(res);
    expect(got.kind).toBe('redirect');
    expect(got.to).toBe('/auth/login');
  });
});

describe('verified custom domain — public end to end', () => {
  it('serves the site root', async () => {
    const res = await middleware(request(CUSTOM_HOST, '/'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site' });
  });

  it('preserves the slug instead of collapsing every URL onto the root', async () => {
    const res = await middleware(request(CUSTOM_HOST, '/documents'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/documents' });
  });

  it('serves a protected-looking path as a page, without a login redirect', async () => {
    // The whole point of 11b-0: `/documents` here is a PAGE named Documents.
    const res = await middleware(request(CUSTOM_HOST, '/documents'));
    expect(outcome(res).kind).not.toBe('redirect');
  });

  it('serves the public page to an authenticated visitor too', async () => {
    signedIn(true);
    const res = await middleware(request(CUSTOM_HOST, '/documents'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/documents' });
  });

  it('leaves API paths alone so the page can still call back', async () => {
    const res = await middleware(request(CUSTOM_HOST, '/api/v1/contact'));
    expect(outcome(res).to ?? '').not.toContain('/public-site');
  });

  it('falls through when the host is not a verified domain', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const res = await middleware(request('unknown-host.example.com', '/documents'));
    expect(outcome(res).to ?? '').not.toContain('/public-site');
  });

  it('does not take down the host when the lookup throws', async () => {
    // A host no earlier case resolved. `findCommunityIdByCustomDomain` keeps a
    // module-level POSITIVE cache that outlives `vi.clearAllMocks()`, so reusing
    // CUSTOM_HOST here would be served from cache and never reach the throw —
    // the test would pass for the wrong reason.
    rpcMock.mockRejectedValue(new Error('db down'));
    const res = await middleware(request('flaky.example.org', '/'));
    expect(res.status).toBeLessThan(500);
    expect(captureMessageMock).toHaveBeenCalled();
  });
});

describe('subdomain public root', () => {
  it('serves the public site to an anonymous visitor', async () => {
    const res = await middleware(request(`sunset-condos.${ROOT_DOMAIN}`, '/'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site' });
  });

  it('serves it to an authenticated visitor too, rather than bouncing to /dashboard', async () => {
    // Changed by 11b-0. The old redirect made every shared public link useless
    // for exactly the people most likely to be signed in.
    signedIn(true);
    const res = await middleware(request(`sunset-condos.${ROOT_DOMAIN}`, '/'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site' });
  });
});
