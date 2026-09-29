/**
 * SUPPORT_WRITABLE_API_ROUTES — the only mutating API calls a `read_only`
 * support session may make (product decision 2026-09-29).
 *
 * Drives the REAL `middleware()` with a real HS256-signed support token, exactly
 * as ordering-invariants.test.ts does; only the service-role
 * `support_sessions` "is this still active?" read is stubbed.
 *
 * Pins, per the brief:
 *   - the allowlist itself (exact contents);
 *   - each allowed (method, path) passes through WITH the support headers;
 *   - a neighbouring path, another verb, POST /account/delete, a trailing
 *     slash, a percent-encoded spelling and an arbitrary write are still 403;
 *   - non-support requests and read_write sessions are unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';

const JWT_SECRET = 'support-writable-routes-test-secret-0123456789abcdef';
const TOKEN_COMMUNITY_ID = 1;

const ADMIN = {
  id: 'admin-uuid',
  email: 'platform.admin@propertypro.test',
  user_metadata: { full_name: 'Ada Admin' },
  emailVerified: true,
};

const { createMiddlewareClientMock, getUserMock, rpcMock, createAdminClientMock, maybeSingleMock } =
  vi.hoisted(() => ({
    createMiddlewareClientMock: vi.fn(),
    getUserMock: vi.fn(),
    rpcMock: vi.fn(),
    createAdminClientMock: vi.fn(),
    maybeSingleMock: vi.fn(),
  }));

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/middleware/rate-limit-config', () => ({
  checkRateLimit: () => null,
  rateLimitedResponse: () => NextResponse.json({ error: 'rate' }, { status: 429 }),
  classifyRoute: () => 'write',
}));

import { middleware } from '@/middleware';
import {
  isSupportWritableApiRoute,
  SUPPORT_WRITABLE_API_ROUTES,
} from '@/lib/support/impersonation';

type Scope = 'read_only' | 'read_write';

async function signSupportToken(scope: Scope = 'read_only'): Promise<string> {
  return new SignJWT({
    act: { sub: ADMIN.id },
    community_id: TOKEN_COMMUNITY_ID,
    session_id: 42,
    scope,
    target_name: 'Olivia Owner',
    target_email: 'owner.one@sunset.local',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('target-user-uuid')
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function activeSessionRow(scope: Scope = 'read_only') {
  return {
    id: 42,
    target_user_id: 'target-user-uuid',
    community_id: TOKEN_COMMUNITY_ID,
    access_level: scope,
    ended_at: null,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

async function call(
  method: string,
  path: string,
  opts: { support?: Scope | false } = {},
): Promise<NextResponse> {
  const url = `http://localhost:3000${path}`;
  const request = new NextRequest(url, { method, headers: { host: 'localhost:3000' } });
  const support = opts.support ?? 'read_only';
  if (support) {
    maybeSingleMock.mockResolvedValue({ data: activeSessionRow(support), error: null });
    request.cookies.set(SUPPORT_SESSION_COOKIE, await signSupportToken(support));
  }
  return middleware(request);
}

function forwarded(res: NextResponse, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

async function expectReadOnly403(res: NextResponse): Promise<void> {
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: 'Forbidden: support session is read-only' });
  expect(forwarded(res, 'x-support-session')).toBeNull();
}

function expectPassedThroughAsSupport(res: NextResponse): void {
  expect(res.status).toBe(200);
  expect(forwarded(res, 'x-support-session')).toBe('1');
  expect(forwarded(res, 'x-support-admin-id')).toBe(ADMIN.id);
  expect(forwarded(res, 'x-support-session-id')).toBe('42');
  expect(forwarded(res, 'x-support-community-id')).toBe(String(TOKEN_COMMUNITY_ID));
  expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'getpropertypro.com');
  vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', JWT_SECRET);

  rpcMock.mockResolvedValue({ data: null, error: null });
  getUserMock.mockResolvedValue({ data: { user: ADMIN }, error: null });
  createMiddlewareClientMock.mockImplementation(async () => ({
    supabase: { auth: { getUser: getUserMock, getClaims: getUserMock }, rpc: rpcMock },
    response: NextResponse.next(),
    user: ADMIN,
    authChecked: true,
  }));
  maybeSingleMock.mockResolvedValue({ data: activeSessionRow(), error: null });
  createAdminClientMock.mockImplementation(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }),
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SUPPORT_WRITABLE_API_ROUTES', () => {
  it('is exactly the four audited account writes', () => {
    expect(SUPPORT_WRITABLE_API_ROUTES).toEqual([
      { method: 'PATCH', path: '/api/v1/account/profile' },
      { method: 'POST', path: '/api/v1/phone/verify/send' },
      { method: 'POST', path: '/api/v1/phone/verify/confirm' },
      { method: 'DELETE', path: '/api/v1/account/delete' },
    ]);
    expect(Object.isFrozen(SUPPORT_WRITABLE_API_ROUTES)).toBe(true);
  });

  it('matches exactly: case-insensitive verb, byte-exact path', () => {
    expect(isSupportWritableApiRoute('patch', '/api/v1/account/profile')).toBe(true);
    expect(isSupportWritableApiRoute('PATCH', '/api/v1/account/profile/')).toBe(false);
    expect(isSupportWritableApiRoute('PATCH', '/api/v1/account/profile/x')).toBe(false);
    expect(isSupportWritableApiRoute('PATCH', '/api/v1/account/%70rofile')).toBe(false);
    expect(isSupportWritableApiRoute('PATCH', '/API/v1/account/profile')).toBe(false);
    expect(isSupportWritableApiRoute('POST', '/api/v1/account/profile')).toBe(false);
    expect(isSupportWritableApiRoute('POST', '/api/v1/account/delete')).toBe(false);
  });
});

describe('read_only support session: the allowlisted writes pass through with support headers', () => {
  it.each(SUPPORT_WRITABLE_API_ROUTES.map((r) => [r.method, r.path] as const))(
    '%s %s',
    async (method, path) => {
      expectPassedThroughAsSupport(await call(method, path));
    },
  );
});

describe('read_only support session: everything else stays read-only', () => {
  it.each([
    // requesting deletion needs the account holder's own password
    ['POST', '/api/v1/account/delete'],
    // other verbs on allowlisted paths
    ['PUT', '/api/v1/account/profile'],
    ['POST', '/api/v1/account/profile'],
    ['DELETE', '/api/v1/account/profile'],
    ['PATCH', '/api/v1/phone/verify/send'],
    ['DELETE', '/api/v1/phone/verify/confirm'],
    ['PATCH', '/api/v1/account/delete'],
    // neighbouring paths
    ['PATCH', '/api/v1/account/profile/avatar'],
    ['POST', '/api/v1/phone/verify'],
    ['POST', '/api/v1/phone/verify/sendx'],
    ['PATCH', '/api/v1/account/password'],
    ['POST', '/api/v1/account/export'],
    // spelling variants of an allowlisted path
    ['PATCH', '/api/v1/account/profile/'],
    ['PATCH', '/api/v1/account/%70rofile'],
    ['PATCH', '/api/v1/Account/profile'],
    // arbitrary writes
    ['POST', '/api/v1/documents'],
    ['DELETE', '/api/v1/residents/5'],
    ['PATCH', '/api/v1/community/contact'],
  ])('%s %s → 403', async (method, path) => {
    await expectReadOnly403(await call(method, path));
  });

  it('the session-management exemption is unchanged (POST /api/v1/support/end-session)', async () => {
    const res = await call('POST', '/api/v1/support/end-session');
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-support-session')).toBe('1');
  });

  it('reads are unaffected (GET /api/v1/account/delete)', async () => {
    expectPassedThroughAsSupport(await call('GET', '/api/v1/account/delete'));
  });
});

describe('unchanged behaviour outside the read_only case', () => {
  it.each([
    ['POST', '/api/v1/documents'],
    ['PATCH', '/api/v1/account/profile'],
    ['POST', '/api/v1/account/delete'],
  ])('no support session: %s %s is not blocked and carries no support headers', async (method, path) => {
    const res = await call(method, path, { support: false });
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-support-session')).toBeNull();
    expect(forwarded(res, 'x-user-id')).toBe(ADMIN.id);
  });

  it.each([
    ['POST', '/api/v1/documents'],
    ['PATCH', '/api/v1/account/profile'],
  ])('read_write session: %s %s passes through as before', async (method, path) => {
    expectPassedThroughAsSupport(await call(method, path, { support: 'read_write' }));
  });
});
