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

const { getUserMock, rpcMock, captureMessageMock, sessionUser } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  captureMessageMock: vi.fn(),
  // `createMiddlewareClient` resolves the session ONCE and hands the caller a
  // `user`; middleware reads that, not `supabase.auth.getUser()`. The mock has
  // to expose it or every case in this file runs as anonymous regardless of
  // `signedIn(true)` — which is how the x-preview gate went untested.
  sessionUser: { current: null as { id: string; email: string } | null },
}));

vi.mock('@sentry/nextjs', () => ({ captureMessage: captureMessageMock }));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: () => ({
    supabase: {
      auth: { getUser: getUserMock, getClaims: getUserMock },
      rpc: rpcMock,
    },
    response: NextResponse.next(),
    user: sessionUser.current,
    authChecked: true,
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
  sessionUser.current = is ? { id: 'u1', email: 'a@b.c' } : null;
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

/**
 * A header middleware forwarded to the downstream request.
 *
 * `NextResponse.next({ request: { headers } })` encodes the forwarded request
 * headers onto the RESPONSE as `x-middleware-request-<name>`; the outcome
 * helper above cannot see them, and "fell through" is only half the assertion
 * for the metadata routes — the point of falling through is that they arrive
 * WITH tenant context.
 */
function forwarded(res: NextResponse, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
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

// ── 11b-2 / S2 — metadata + public-suffix passthrough on custom domains ────
//
// Every case below uses a hostname no earlier case in this file has used.
// `findCommunityIdByCustomDomain` keeps a module-level POSITIVE cache that
// outlives `vi.clearAllMocks()`, so a reused host is served from cache and
// never reaches the code under test — it would pass for the wrong reason.
describe('custom domain — metadata routes reach their own handlers [D12/D14]', () => {
  it('does NOT rewrite /sitemap.xml, and forwards tenant context to it', async () => {
    // Before 11b-2 this was rewritten to /public-site/sitemap.xml — a 404 on
    // the one host where a per-page sitemap actually matters.
    const res = await middleware(request('sitemap-domain.example.com', '/sitemap.xml'));
    expect(outcome(res).kind).toBe('next');
    expect(forwarded(res, 'x-community-id')).toBe('7');
    expect(forwarded(res, 'x-tenant-source')).toBe('custom_domain');
  });

  it('does NOT rewrite /robots.txt, and forwards tenant context to it', async () => {
    const res = await middleware(request('robots-domain.example.com', '/robots.txt'));
    expect(outcome(res).kind).toBe('next');
    expect(forwarded(res, 'x-community-id')).toBe('7');
    expect(forwarded(res, 'x-tenant-source')).toBe('custom_domain');
  });
});

describe('custom domain — path-public suffixes reach their own renderer [D13]', () => {
  it('rewrites /transparency to /public-transparency, not /public-site', async () => {
    // The /public-transparency branch further down explicitly refuses
    // `source === 'custom_domain'`, so before 11b-2 this path was captured by
    // the host-precedence block and 404'd as /public-site/transparency.
    const res = await middleware(request('transparency-domain.example.com', '/transparency'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-transparency' });
    expect(forwarded(res, 'x-community-id')).toBe('7');
  });

  it('still rewrites an ordinary page slug to /public-site/<slug>', async () => {
    // Regression guard on the 11b-0 behaviour this slice must not disturb.
    const res = await middleware(request('about-domain.example.com', '/about'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/about' });
  });
});

// ── 11b-2 / S3 — subdomain path-preserving public rewrite ─────────────────
//
// The highest-risk change in the phase: this branch sits ABOVE
// `isProtectedPath`, so getting it wrong routes residents' app URLs to the
// public renderer. Each case uses a distinct community slug so the
// module-level tenant cache cannot serve a stale answer.
describe('community subdomain — the app still wins every reserved slug', () => {
  it('serves /dashboard as the app to an AUTHENTICATED resident, not /public-site', async () => {
    signedIn(true);
    const res = await middleware(request(`dash-auth-condos.${ROOT_DOMAIN}`, '/dashboard'));
    expect(outcome(res).to ?? '').not.toContain('/public-site');
  });

  it('redirects /dashboard to /auth/login for an ANONYMOUS visitor', async () => {
    const res = await middleware(request(`dash-anon-condos.${ROOT_DOMAIN}`, '/dashboard'));
    const got = outcome(res);
    expect(got.kind).toBe('redirect');
    expect(got.to).toBe('/auth/login');
  });

  it('serves /welcome as the app route — this is what the S1 derivation buys', async () => {
    // `/welcome` is a protected app route that was MISSING from the
    // hand-written reserved list. Without S1, this branch would rewrite it to
    // /public-site/welcome for every resident on the subdomain.
    signedIn(true);
    const res = await middleware(request(`welcome-condos.${ROOT_DOMAIN}`, '/welcome'));
    expect(outcome(res).to ?? '').not.toContain('/public-site');
  });

  it('redirects /welcome anonymously to login, exactly like any protected route', async () => {
    const res = await middleware(request(`welcome-anon-condos.${ROOT_DOMAIN}`, '/welcome'));
    expect(outcome(res)).toEqual({ kind: 'redirect', to: '/auth/login' });
  });

  it.each([
    ['/api/v1/documents', 'api'],
    ['/_next/image', 'next'],
  ])('leaves infrastructure path %s alone', async (path, tag) => {
    const res = await middleware(request(`infra-${tag}-condos.${ROOT_DOMAIN}`, path));
    expect(outcome(res).to ?? '').not.toContain('/public-site');
  });

  it('leaves a nested path to the app — slugs cannot contain "/" [D5]', async () => {
    signedIn(true);
    const res = await middleware(request(`nested-condos.${ROOT_DOMAIN}`, '/a/b'));
    expect(outcome(res).to ?? '').not.toContain('/public-site');
  });
});

describe('community subdomain — public page slugs now resolve [D1]', () => {
  it('rewrites /about to /public-site/about for an anonymous visitor', async () => {
    const res = await middleware(request(`about-condos.${ROOT_DOMAIN}`, '/about'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/about' });
    expect(forwarded(res, 'x-community-id')).toBe('7');
  });

  it('rewrites /about for an authenticated resident too', async () => {
    signedIn(true);
    const res = await middleware(request(`about-auth-condos.${ROOT_DOMAIN}`, '/about'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/about' });
  });

  it('does not let a protected PREFIX swallow a real page slug', async () => {
    // `/documents-2024` starts with `/documents`, so below `isProtectedPath`
    // this would have redirected a visitor to login. That prefix-match hazard
    // is the reason the branch sits above it (D2).
    const res = await middleware(request(`docs2024-condos.${ROOT_DOMAIN}`, '/documents-2024'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/documents-2024' });
  });

  it('serves /sitemap.xml from its own handler, with tenant headers [D14]', async () => {
    const res = await middleware(request(`sitemap-condos.${ROOT_DOMAIN}`, '/sitemap.xml'));
    expect(outcome(res).kind).toBe('next');
    expect(forwarded(res, 'x-community-id')).toBe('7');
    expect(forwarded(res, 'x-tenant-slug')).toBe('sitemap-condos');
  });

  it('serves /robots.txt from its own handler, with tenant headers [D14]', async () => {
    const res = await middleware(request(`robots-condos.${ROOT_DOMAIN}`, '/robots.txt'));
    expect(outcome(res).kind).toBe('next');
    expect(forwarded(res, 'x-community-id')).toBe('7');
  });

  it('still rewrites /transparency to /public-transparency', async () => {
    // `transparency` is reserved, so the new branch declines it and the
    // existing host-native transparency branch keeps handling it.
    const res = await middleware(request(`transp-condos.${ROOT_DOMAIN}`, '/transparency'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-transparency' });
  });

  it('forwards x-preview when ?preview=true and there is a session', async () => {
    signedIn(true);
    const res = await middleware(
      new NextRequest(`https://preview-condos.${ROOT_DOMAIN}/about?preview=true`, {
        headers: { host: `preview-condos.${ROOT_DOMAIN}` },
      }),
    );
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/about' });
    expect(forwarded(res, 'x-preview')).toBe('true');
  });

  // `?preview=true` is a query string — anyone can type it. 11b-2 threads
  // `x-preview` to the PAGE-row lookup as well as the block lookup, so an
  // ungated stamp would hand an anonymous visitor a page the PM never
  // published. D7 says an unpublished page is a 404 to the public.
  it('does NOT forward x-preview for an anonymous ?preview=true', async () => {
    signedIn(false);
    const res = await middleware(
      new NextRequest(`https://anonpreview-condos.${ROOT_DOMAIN}/about?preview=true`, {
        headers: { host: `anonpreview-condos.${ROOT_DOMAIN}` },
      }),
    );
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/about' });
    expect(forwarded(res, 'x-preview')).toBeNull();
  });

  it('does NOT forward x-preview for an anonymous ?preview=true on a custom domain', async () => {
    signedIn(false);
    const res = await middleware(
      new NextRequest(`https://anon-preview.example.com/about?preview=true`, {
        headers: { host: 'anon-preview.example.com' },
      }),
    );
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/about' });
    expect(forwarded(res, 'x-preview')).toBeNull();
  });

  it('still serves a page when the tenant lookup throws, and reports it', async () => {
    rpcMock.mockRejectedValue(new Error('db down'));
    const res = await middleware(request(`flaky-condos.${ROOT_DOMAIN}`, '/about'));
    expect(outcome(res)).toEqual({ kind: 'rewrite', to: '/public-site/about' });
    expect(captureMessageMock).toHaveBeenCalled();
  });

  it('does not turn an APP-host path into a public page', async () => {
    // The safety property: path-preserving public routing is a HOST property.
    // `app.` is a reserved subdomain, so nothing here applies.
    signedIn(true);
    const res = await middleware(request(`app.${ROOT_DOMAIN}`, '/about'));
    expect(outcome(res).to ?? '').not.toContain('/public-site');
  });

  it('does not let ?communityId= turn an app host into a public site', async () => {
    signedIn(true);
    const res = await middleware(
      new NextRequest(`https://admin.${ROOT_DOMAIN}/about?communityId=7`, {
        headers: { host: `admin.${ROOT_DOMAIN}` },
      }),
    );
    expect(outcome(res).to ?? '').not.toContain('/public-site');
  });
});
