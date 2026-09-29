/**
 * Ordering invariants of `middleware()` (roadmap 3.9 / INF-01, narrowed).
 *
 * `middleware()` is one long function whose ~18 blocks share mutable
 * `forwardedHeaders` / `response` state, so several of its security properties
 * hold only because block A happens to run before block B. Nothing asserted
 * those orderings; a mechanical extraction could silently swap two blocks and
 * every existing test would stay green. This file pins them — as the code
 * behaves TODAY, not as it ideally would:
 *
 *   1. Protected-path tenant resolution runs BEFORE the support-impersonation
 *      branch, which reads the resolved `x-community-id` as the token's
 *      expected community. When none resolves, an accepted session stamps its
 *      own consented community (fill-only), so header-reconciling routes are
 *      pinned to it; an /api/v1/communities/<id> path must also match. (Page-
 *      level reads that ignore the header, e.g. /pm/reports, are not pinned.)
 *   2. The CORS preflight and the CSRF Origin/Referer reject short-circuit
 *      BEFORE the Supabase session refresh (`createMiddlewareClient`).
 *   3. Early responses (dev-surface 404, apex / signup-host redirects,
 *      preflight, CSRF 403) are returned raw — no `X-Request-ID`, no security
 *      headers — while the normal path goes through `finaliseResponse`.
 *   4. Inbound-header sanitisation runs BEFORE the support branch, so a
 *      spoofed `x-community-id` can neither survive to the forwarded request
 *      nor steer the support session's community check.
 *
 * Invariant 1 and 4 drive the REAL `resolveActiveSupportSession` with a real
 * HS256-signed token; only the service-role `support_sessions` read is
 * stubbed. Mocking `resolveActiveSupportSession` itself (as
 * support-impersonation-identity.test.ts does) would erase the very comparison
 * whose input ordering is under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';

const ROOT_DOMAIN = 'getpropertypro.com';
const JWT_SECRET = 'ordering-invariants-test-secret-0123456789abcdef';
const TOKEN_COMMUNITY_ID = 1;

const ADMIN = {
  id: 'admin-uuid',
  email: 'platform.admin@propertypro.test',
  user_metadata: { full_name: 'Ada Admin' },
  emailVerified: true,
};

const {
  createMiddlewareClientMock,
  getUserMock,
  rpcMock,
  createAdminClientMock,
  maybeSingleMock,
  sessionUser,
} = vi.hoisted(() => ({
  createMiddlewareClientMock: vi.fn(),
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  sessionUser: { current: null as Record<string, unknown> | null },
}));

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

// The only stub on the support path: the service-role "is this session still
// active?" read. JWT verification and the expected-community comparison run
// for real.
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/middleware/rate-limit-config', () => ({
  checkRateLimit: () => null,
  rateLimitedResponse: () => NextResponse.json({ error: 'rate' }, { status: 429 }),
  classifyRoute: () => 'read',
}));

import { middleware } from '@/middleware';

async function signSupportToken(communityId: number = TOKEN_COMMUNITY_ID): Promise<string> {
  return new SignJWT({
    act: { sub: ADMIN.id },
    community_id: communityId,
    session_id: 42,
    scope: 'read_only',
    target_name: 'Olivia Owner',
    target_email: 'owner.one@sunset.local',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('target-user-uuid')
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function activeSessionRow(communityId: number = TOKEN_COMMUNITY_ID) {
  return {
    id: 42,
    target_user_id: 'target-user-uuid',
    community_id: communityId,
    access_level: 'read_only',
    ended_at: null,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

function req(
  url: string,
  init: { method?: string; headers?: Record<string, string>; supportToken?: string } = {},
): NextRequest {
  const parsed = new URL(url);
  const request = new NextRequest(url, {
    method: init.method ?? 'GET',
    headers: { host: parsed.host, ...(init.headers ?? {}) },
  });
  if (init.supportToken) {
    request.cookies.set(SUPPORT_SESSION_COOKIE, init.supportToken);
  }
  return request;
}

function forwarded(res: NextResponse, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', ROOT_DOMAIN);
  vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', JWT_SECRET);

  sessionUser.current = ADMIN;
  rpcMock.mockResolvedValue({ data: null, error: null });
  getUserMock.mockResolvedValue({ data: { user: ADMIN }, error: null });
  createMiddlewareClientMock.mockImplementation(async () => ({
    supabase: { auth: { getUser: getUserMock, getClaims: getUserMock }, rpc: rpcMock },
    response: NextResponse.next(),
    user: sessionUser.current,
    authChecked: true,
  }));

  maybeSingleMock.mockResolvedValue({ data: activeSessionRow(), error: null });
  createAdminClientMock.mockImplementation(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. Tenant resolution precedes the support branch
// ---------------------------------------------------------------------------

describe('invariant 1: tenant resolution runs before the support-impersonation branch', () => {
  it('accepts the support session when the resolved tenant MATCHES the token community', async () => {
    const res = await middleware(
      req(`http://localhost:3000/api/v1/documents?communityId=${TOKEN_COMMUNITY_ID}`, {
        supportToken: await signSupportToken(),
      }),
    );

    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    // The session row was consulted, i.e. the community check PASSED first.
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
  });

  it('rejects the support session when the resolved tenant DIFFERS from the token community', async () => {
    const res = await middleware(
      req('http://localhost:3000/api/v1/documents?communityId=2', {
        supportToken: await signSupportToken(),
      }),
    );

    // Current behaviour: not a 403 — the request proceeds as the ADMIN's own
    // session, the support cookie is cleared, and no support headers are set.
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-community-id')).toBe('2');
    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(forwarded(res, 'x-user-id')).toBe(ADMIN.id);
    expect(res.headers.get('set-cookie') ?? '').toMatch(
      new RegExp(`${SUPPORT_SESSION_COOKIE}=;.*Max-Age=0`, 'i'),
    );
    // Rejected on the community comparison, BEFORE the DB read.
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('uses the /communities/[id] path fallback as the expected community too', async () => {
    const res = await middleware(
      req('http://localhost:3000/communities/2/settings', {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-community-id')).toBe('2');
    expect(forwarded(res, 'x-tenant-source')).toBe('path_segment');
    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('STAMPS the session community when no tenant resolves (fill-only pin)', async () => {
    // No tenant in scope, so expectedCommunityId is null and the comparison in
    // resolveActiveSupportSession is skipped. The session is still accepted,
    // but the forwarded request is now pinned to the token's consented
    // community, so downstream resolveEffectiveCommunityId 404s any other one
    // (apps/web/__tests__/tenant/resolve-effective-community-id.test.ts).
    const res = await middleware(
      req('http://localhost:3000/api/v1/documents', {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
    expect(forwarded(res, 'x-tenant-source')).toBe('support_session');
    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 1b. A support session pins its consented community on tenant-less requests
// ---------------------------------------------------------------------------

describe('support session stamps its consented community when no tenant resolves', () => {
  it('(a) apex /api/v1/communities/<B>/... REJECTS a session consented to by A', async () => {
    // cancel-preview reads the community from params.id and never reconciles
    // x-community-id, so a stamp alone could not pin it: the path id is used as
    // the expected community, and the mismatch rejects the session.
    const res = await middleware(
      req(`https://${ROOT_DOMAIN}/api/v1/communities/2/cancel-preview`, {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(forwarded(res, 'x-user-id')).toBe(ADMIN.id);
    expect(res.headers.get('set-cookie') ?? '').toMatch(
      new RegExp(`${SUPPORT_SESSION_COOKIE}=;.*Max-Age=0`, 'i'),
    );
    // Rejected on the community comparison, BEFORE the DB read.
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('(a1) B\'s /api/v1/communities path with a RESOLVED tenant A is still rejected', async () => {
    // Bypass the tenant-only comparison would allow: ?communityId=A resolves A
    // (equal to the token), while the route reads B from params.id.
    const res = await middleware(
      req(
        `http://localhost:3000/api/v1/communities/2/cancel-preview?communityId=${TOKEN_COMMUNITY_ID}`,
        { supportToken: await signSupportToken() },
      ),
    );

    expect(forwarded(res, 'x-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(forwarded(res, 'x-user-id')).toBe(ADMIN.id);
    expect(res.headers.get('set-cookie') ?? '').toMatch(
      new RegExp(`${SUPPORT_SESSION_COOKIE}=;.*Max-Age=0`, 'i'),
    );
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('(a3) a percent-encoded path id (%32 = 2) is decoded and rejected, not skipped', async () => {
    // Next decodes dynamic params, so the route would see id=2.
    const res = await middleware(
      req(`https://${ROOT_DOMAIN}/api/v1/communities/%32/cancel-preview`, {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(forwarded(res, 'x-user-id')).toBe(ADMIN.id);
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('(a4) an undecodable path segment fails closed', async () => {
    const res = await middleware(
      req(`https://${ROOT_DOMAIN}/api/v1/communities/%E0%A4%A/cancel-preview`, {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('(a5) a non-numeric sibling route (/api/v1/communities/delete) is not a community id', async () => {
    const res = await middleware(
      req(`https://${ROOT_DOMAIN}/api/v1/communities/delete`, {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
  });

  it('(a6) a /communities/<B> PAGE with ?communityId=A is rejected too', async () => {
    const res = await middleware(
      req(`http://localhost:3000/communities/2/board?communityId=${TOKEN_COMMUNITY_ID}`, {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('(a2) apex /api/v1/communities/<A>/... accepts the session and stamps A', async () => {
    const res = await middleware(
      req(`https://${ROOT_DOMAIN}/api/v1/communities/${TOKEN_COMMUNITY_ID}/cancel-preview`, {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    expect(forwarded(res, 'x-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
    expect(forwarded(res, 'x-tenant-source')).toBe('support_session');
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
  });

  it('(b) a resolved tenant EQUAL to the session community is accepted and left unchanged', async () => {
    const res = await middleware(
      req(`http://localhost:3000/api/v1/documents?communityId=${TOKEN_COMMUNITY_ID}`, {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
    // Fill-only: tenant resolution's own source survives, not 'support_session'.
    expect(forwarded(res, 'x-tenant-source')).toBe('community_id');
  });

  it('(c) a resolved tenant DIFFERENT from the session community is still rejected', async () => {
    const res = await middleware(
      req('http://localhost:3000/api/v1/documents?communityId=2', {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(forwarded(res, 'x-user-id')).toBe(ADMIN.id);
    expect(forwarded(res, 'x-community-id')).toBe('2');
    expect(forwarded(res, 'x-tenant-source')).toBe('community_id');
    expect(res.headers.get('set-cookie') ?? '').toMatch(
      new RegExp(`${SUPPORT_SESSION_COOKIE}=;.*Max-Age=0`, 'i'),
    );
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('(d) an inbound spoofed x-community-id is stripped; the stamped value is the session\'s', async () => {
    const res = await middleware(
      req('http://localhost:3000/api/v1/documents', {
        headers: { 'x-community-id': '2', 'x-tenant-source': 'spoofed' },
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
    expect(forwarded(res, 'x-tenant-source')).toBe('support_session');
  });

  it('(e) does NOT stamp on TENANT_OPTIONAL_PATHS (/select-community redirect-loop guard)', async () => {
    const res = await middleware(
      req('http://localhost:3000/select-community', {
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    expect(forwarded(res, 'x-community-id')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Preflight + CSRF short-circuit before the Supabase session refresh
// ---------------------------------------------------------------------------

describe('invariant 2: preflight and CSRF reject return before any Supabase session refresh', () => {
  it('allowed-origin OPTIONS preflight → 204, no Supabase client built', async () => {
    const res = await middleware(
      req('https://app.getpropertypro.com/api/v1/documents', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.getpropertypro.com' },
      }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.getpropertypro.com',
    );
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('disallowed-origin OPTIONS preflight → 403, no Supabase client built', async () => {
    const res = await middleware(
      req('https://app.getpropertypro.com/api/v1/documents', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
    );

    expect(res.status).toBe(403);
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('CSRF: disallowed Origin on a POST → 403 "invalid origin", no Supabase client built', async () => {
    const res = await middleware(
      req('https://app.getpropertypro.com/api/v1/documents', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: invalid origin' });
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('CSRF: no Origin + disallowed Referer on a DELETE → 403 "invalid referer", no Supabase client built', async () => {
    const res = await middleware(
      req('https://app.getpropertypro.com/api/v1/documents', {
        method: 'DELETE',
        headers: { referer: 'https://evil.example/attack' },
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: invalid referer' });
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('control: an allowed-origin POST DOES reach the session refresh', async () => {
    await middleware(
      req('https://app.getpropertypro.com/api/v1/documents', {
        method: 'POST',
        headers: { origin: 'https://app.getpropertypro.com' },
      }),
    );

    expect(createMiddlewareClientMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Which responses carry X-Request-ID / security headers
// ---------------------------------------------------------------------------

/** Headers finaliseResponse stamps on every response it touches. */
function hasFinalisedHeaders(res: NextResponse): boolean {
  return (
    res.headers.get('X-Request-ID') !== null &&
    res.headers.get('X-Content-Type-Options') === 'nosniff' &&
    res.headers.get('Referrer-Policy') !== null
  );
}

function expectRaw(res: NextResponse): void {
  expect(res.headers.get('X-Request-ID')).toBeNull();
  expect(res.headers.get('X-Content-Type-Options')).toBeNull();
  expect(res.headers.get('Referrer-Policy')).toBeNull();
  expect(res.headers.get('X-Frame-Options')).toBeNull();
  expect(res.headers.get('Content-Security-Policy')).toBeNull();
}

describe('invariant 3: early responses keep today\'s (bare) header set', () => {
  it('dev-surface 404 rewrite in production: no X-Request-ID, no security headers', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await middleware(req('https://www.getpropertypro.com/dev/login'));

    expect(res.headers.get('x-middleware-rewrite')).toMatch(/\/404$/);
    expectRaw(res);
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
  });

  it('apex path-based public route → 308 to the subdomain: bare', async () => {
    const res = await middleware(req('https://getpropertypro.com/sunset-condos'));

    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://sunset-condos.getpropertypro.com/');
    expectRaw(res);
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
  });

  it('signup on a non-canonical subdomain → 307 to the web origin: bare', async () => {
    const res = await middleware(
      req('https://pm.getpropertypro.com/signup?signupRequestId=abc'),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/signup\?signupRequestId=abc$/);
    expectRaw(res);
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
  });

  it('allowed preflight 204: CORS headers only, no X-Request-ID or security headers', async () => {
    const res = await middleware(
      req('https://app.getpropertypro.com/api/v1/documents', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.getpropertypro.com' },
      }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
    expectRaw(res);
  });

  it('rejected preflight 403: bare', async () => {
    const res = await middleware(
      req('https://app.getpropertypro.com/api/v1/documents', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
    );

    expect(res.status).toBe(403);
    expectRaw(res);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('CSRF 403: bare', async () => {
    const res = await middleware(
      req('https://app.getpropertypro.com/api/v1/documents', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
    );

    expect(res.status).toBe(403);
    expectRaw(res);
  });

  it('control: the normal finaliseResponse path stamps X-Request-ID and security headers', async () => {
    const res = await middleware(
      req('http://localhost:3000/api/v1/documents?communityId=1', {
        headers: { 'x-request-id': 'req-ordering-1' },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-ID')).toBe('req-ordering-1');
    expect(hasFinalisedHeaders(res)).toBe(true);
    // API responses get no CSP; that is finaliseResponse's rule, not an omission.
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('control: an early-in-the-auth-phase 401 is ALSO finalised', async () => {
    sessionUser.current = null;
    const res = await middleware(req('http://localhost:3000/api/v1/documents'));

    expect(res.status).toBe(401);
    expect(hasFinalisedHeaders(res)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Sanitisation precedes the rate-limit phase and the support branch
// ---------------------------------------------------------------------------
//
// Already covered elsewhere, deliberately NOT duplicated here:
//   - spoofed x-community-id / x-user-id stripped on a protected API path with
//     no support session → phase5-security-gates.test.ts
//     ("strips spoofed tenant headers before forwarding downstream");
//   - a spoofed x-user-id cannot dodge the user-keyed write throttle →
//     phase5-security-gates.test.ts
//     ("does not allow spoofed x-user-id headers to bypass write throttling");
//   - inbound x-support-* stripped with no support session →
//     support-impersonation-identity.test.ts.
// What follows covers the headers nothing later in the function overwrites,
// and the support-session interaction.

describe('invariant 4: header sanitisation precedes the support branch', () => {
  it('a spoofed x-community-id does not steer the support session\'s community check', async () => {
    // Token community 1, spoofed header 2, no real tenant. If the support
    // branch saw the spoof it would reject the session on a community
    // mismatch. Sanitised first, it sees NO community, accepts (per invariant
    // 1's last case), and stamps the TOKEN's community, never the spoof.
    const res = await middleware(
      req('http://localhost:3000/api/v1/documents', {
        headers: { 'x-community-id': '2' },
        supportToken: await signSupportToken(),
      }),
    );

    // Steering asserted first: under a reorder, THIS is the defect.
    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    expect(forwarded(res, 'x-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
  });

  it('spoofed identity/support/tenant headers never survive a support session', async () => {
    const res = await middleware(
      req('http://localhost:3000/api/v1/documents', {
        headers: {
          'x-user-id': 'attacker',
          'x-user-phone': '555-0100',
          'x-tenant-slug': 'evil',
          'x-tenant-source': 'spoofed',
          'x-support-session-id': '999',
          'x-support-admin-id': 'attacker-admin',
          'x-preview': 'true',
        },
        supportToken: await signSupportToken(),
      }),
    );

    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    expect(forwarded(res, 'x-support-session-id')).toBe('42');
    expect(forwarded(res, 'x-support-admin-id')).toBe(ADMIN.id);
    expect(forwarded(res, 'x-user-phone')).toBeNull();
    expect(forwarded(res, 'x-tenant-slug')).toBeNull();
    // Stripped, then replaced by the support-session community stamp.
    expect(forwarded(res, 'x-tenant-source')).toBe('support_session');
    expect(forwarded(res, 'x-preview')).toBeNull();
  });

  it('spoofed headers that nothing downstream overwrites are stripped without a support session', async () => {
    const res = await middleware(
      req('http://localhost:3000/api/v1/documents', {
        headers: {
          'x-user-phone': '555-0100',
          'x-user-full-name': 'Mallory',
          'x-tenant-slug': 'evil',
          'x-tenant-source': 'spoofed',
          'x-preview': 'true',
        },
      }),
    );

    expect(res.status).toBe(200);
    // ADMIN has no phone, so a surviving value could only be the spoof.
    expect(forwarded(res, 'x-user-phone')).toBeNull();
    expect(forwarded(res, 'x-user-full-name')).toBe('Ada Admin');
    expect(forwarded(res, 'x-tenant-slug')).toBeNull();
    expect(forwarded(res, 'x-tenant-source')).toBeNull();
    expect(forwarded(res, 'x-preview')).toBeNull();
  });
});
