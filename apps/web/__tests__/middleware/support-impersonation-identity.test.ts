/**
 * Support impersonation must forward ONE identity, not a mixture.
 *
 * The page shell builds its user entirely from three forwarded headers
 * (`lib/request/page-auth-context.ts`): id, email, full name. The support
 * branch of `middleware.ts` used to override only the **id**, leaving the
 * authenticating admin's email/name/phone in place. The result was chrome that
 * showed the admin's identity above the impersonated user's data — an operator
 * could not tell from the account menu whose account they were in, and with a
 * named admin it displayed a confidently wrong name.
 *
 * These tests drive the real `middleware()` export and assert on the headers it
 * forwards. The load-bearing case is the third one: a token WITHOUT the
 * identity claims must CLEAR the headers, never inherit the admin's — absent is
 * safe, wrong is not.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';

const ROOT_DOMAIN = 'getpropertypro.com';

/** The impersonating platform admin — the identity that must NOT leak through. */
const ADMIN = {
  id: 'admin-uuid',
  email: 'platform.admin@propertypro.test',
  phone: '305-555-0000',
  user_metadata: { full_name: 'Ada Admin' },
  // `createMiddlewareClient` resolves this; without it middleware redirects to
  // /auth/verify-email and never reaches the support branch under test.
  emailVerified: true,
};

const { getUserMock, rpcMock, resolveActiveSupportSessionMock, sessionUser } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    rpcMock: vi.fn(),
    resolveActiveSupportSessionMock: vi.fn(),
    sessionUser: { current: null as Record<string, unknown> | null },
  }),
);

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

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

vi.mock('@/lib/middleware/rate-limit-config', () => ({
  checkRateLimit: () => null,
  rateLimitedResponse: () => NextResponse.json({ error: 'rate' }, { status: 429 }),
  classifyRoute: () => 'read',
}));

vi.mock('@/lib/support/impersonation', () => ({
  resolveActiveSupportSession: resolveActiveSupportSessionMock,
  // GET only in these tests, so nothing is blocked as a read-only mutation.
  isReadOnlyBlocked: () => false,
}));

import { middleware } from '@/middleware';

function requestWithSupportCookie(path: string): NextRequest {
  const req = new NextRequest(`https://app.${ROOT_DOMAIN}${path}`, {
    headers: { host: `app.${ROOT_DOMAIN}` },
  });
  req.cookies.set(SUPPORT_SESSION_COOKIE, 'signed.support.token');
  return req;
}

function forwarded(res: NextResponse, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

/** A resolved support session impersonating `target`, acting as ADMIN. */
function supportSession(extra: Record<string, unknown>) {
  return {
    sub: 'target-user-uuid',
    act: { sub: ADMIN.id },
    community_id: 1,
    session_id: 42,
    scope: 'read_only' as const,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NEXT_PUBLIC_ROOT_DOMAIN'] = ROOT_DOMAIN;
  rpcMock.mockResolvedValue({ data: null, error: null });

  // Signed in AS THE ADMIN — this is what populates the identity headers that
  // the support branch must then displace.
  sessionUser.current = ADMIN;
  getUserMock.mockResolvedValue({
    data: { user: ADMIN, claims: { sub: ADMIN.id } },
    error: null,
  });
});

describe('support impersonation — forwarded identity', () => {
  it('forwards the impersonated user, not the admin, when the token carries identity claims', async () => {
    resolveActiveSupportSessionMock.mockResolvedValue(
      supportSession({
        target_name: 'Olivia Owner',
        target_email: 'owner.one@sunset.local',
      }),
    );

    const res = await middleware(requestWithSupportCookie('/api/v1/documents'));

    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    expect(forwarded(res, 'x-user-full-name')).toBe('Olivia Owner');
    expect(forwarded(res, 'x-user-email')).toBe('owner.one@sunset.local');
  });

  it("never forwards the admin's name, email or phone during impersonation", async () => {
    resolveActiveSupportSessionMock.mockResolvedValue(
      supportSession({
        target_name: 'Olivia Owner',
        target_email: 'owner.one@sunset.local',
      }),
    );

    const res = await middleware(requestWithSupportCookie('/api/v1/documents'));

    // Asserted positively FIRST. `not.toBe(admin)` passes trivially when the
    // header is null, so on its own it would keep passing even if middleware
    // stopped forwarding identity altogether — proving nothing.
    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    expect(forwarded(res, 'x-user-full-name')).toBe('Olivia Owner');
    expect(forwarded(res, 'x-user-email')).toBe('owner.one@sunset.local');

    expect(forwarded(res, 'x-user-full-name')).not.toBe(ADMIN.user_metadata.full_name);
    expect(forwarded(res, 'x-user-email')).not.toBe(ADMIN.email);
    expect(forwarded(res, 'x-user-id')).not.toBe(ADMIN.id);
    // Phone has no claim and is unconditionally dropped.
    expect(forwarded(res, 'x-user-phone')).toBeNull();
  });

  it('CLEARS identity rather than inheriting the admin when the token predates the claims', async () => {
    // A token signed before target_name/target_email existed. Still valid until
    // it expires, and this is exactly the case that previously leaked.
    resolveActiveSupportSessionMock.mockResolvedValue(
      supportSession({ target_name: null, target_email: null }),
    );

    const res = await middleware(requestWithSupportCookie('/api/v1/documents'));

    expect(forwarded(res, 'x-user-id')).toBe('target-user-uuid');
    expect(forwarded(res, 'x-user-full-name')).toBeNull();
    expect(forwarded(res, 'x-user-email')).toBeNull();
    expect(forwarded(res, 'x-user-phone')).toBeNull();
  });

  it('leaves the normal (non-impersonated) identity headers untouched', async () => {
    resolveActiveSupportSessionMock.mockResolvedValue(null);

    const res = await middleware(
      new NextRequest(`https://app.${ROOT_DOMAIN}/api/v1/documents`, {
        headers: { host: `app.${ROOT_DOMAIN}` },
      }),
    );

    expect(forwarded(res, 'x-user-id')).toBe(ADMIN.id);
    expect(forwarded(res, 'x-user-full-name')).toBe('Ada Admin');
    expect(forwarded(res, 'x-user-email')).toBe(ADMIN.email);
  });

  it('sanitizes CR/LF out of the impersonated identity instead of throwing', async () => {
    // `users.full_name` / `users.email` are free text and reachable via the CSV
    // resident import. `Headers.set` THROWS on CR/LF, and the throw is uncaught
    // in middleware — without normalization every request carrying the support
    // cookie 500s until the session expires, so the operator cannot even
    // navigate away to end it.
    resolveActiveSupportSessionMock.mockResolvedValue(
      supportSession({
        target_name: 'Ada\r\nX-Injected: 1',
        target_email: 'owner@x.test\r\nX-Evil: 2',
      }),
    );

    const res = await middleware(requestWithSupportCookie('/api/v1/documents'));

    expect(forwarded(res, 'x-user-full-name')).toBe('Ada X-Injected: 1');
    expect(forwarded(res, 'x-user-email')).toBe('owner@x.test X-Evil: 2');
    expect(forwarded(res, 'x-injected')).toBeNull();
    expect(forwarded(res, 'x-evil')).toBeNull();
  });

  it('clears rather than sets an empty header for a whitespace-only name', async () => {
    resolveActiveSupportSessionMock.mockResolvedValue(
      supportSession({ target_name: '   ', target_email: 'owner@x.test' }),
    );

    const res = await middleware(requestWithSupportCookie('/api/v1/documents'));

    expect(forwarded(res, 'x-user-full-name')).toBeNull();
    expect(forwarded(res, 'x-user-email')).toBe('owner@x.test');
  });

  it('still marks the request as a support session', async () => {
    resolveActiveSupportSessionMock.mockResolvedValue(
      supportSession({ target_name: 'Olivia Owner', target_email: 'o@x.test' }),
    );

    const res = await middleware(requestWithSupportCookie('/api/v1/documents'));

    expect(forwarded(res, 'x-support-session')).toBe('1');
    expect(forwarded(res, 'x-support-admin-id')).toBe(ADMIN.id);
    expect(forwarded(res, 'x-support-session-id')).toBe('42');
  });
});
