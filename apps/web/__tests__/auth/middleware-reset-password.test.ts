/**
 * Regression guard for the password-reset loop production bug.
 *
 * Background: the middleware redirects authenticated users away from /auth/*
 * to prevent logged-in users from seeing the login/forgot-password pages. On
 * /auth/reset-password the user arrives with a live Supabase recovery session
 * (PKCE code exchange on page load), so the redirect guard *would* fire on
 * the Server Action POST that submits the new password — intercepting it
 * before `supabase.auth.updateUser()` runs and silently failing the reset.
 *
 * This test pins the exclusion so /auth/reset-password behaves like
 * /auth/verify-email: authenticated users are NOT bounced away, while other
 * /auth/* paths (e.g. /auth/login) still are.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { resetGlobalRateLimiter } from '../../src/lib/middleware/rate-limiter';

const { createMiddlewareClientMock, getUserMock } = vi.hoisted(() => ({
  createMiddlewareClientMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { middleware } from '../../src/middleware';

function authRequest(pathname: string, method: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method,
    headers: {
      host: 'localhost:3000',
      'x-real-ip': '203.0.113.42',
    },
  });
}

describe('middleware: /auth/reset-password exclusion from authenticated-redirect guard', () => {
  beforeEach(() => {
    resetGlobalRateLimiter();
    vi.clearAllMocks();

    // Simulate the production condition: the user has a valid Supabase
    // recovery session (PKCE exchange completed on page load).
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'recovery-session-user',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    createMiddlewareClientMock.mockImplementation(async () => ({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
      },
      response: NextResponse.next(),
    }));
  });

  afterEach(() => {
    resetGlobalRateLimiter();
  });

  it('does NOT redirect an authenticated GET to /auth/reset-password', async () => {
    const response = await middleware(authRequest('/auth/reset-password', 'GET'));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does NOT redirect an authenticated Server Action POST to /auth/reset-password', async () => {
    // Reproduces the production bug: Next.js Server Actions POST to the
    // current page URL. Before the fix, this POST was intercepted by the
    // auth-redirect guard, so `updatePasswordAction` never executed.
    const response = await middleware(authRequest('/auth/reset-password', 'POST'));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('still redirects an authenticated GET to /auth/login (control case)', async () => {
    // Sanity check: the guard must still bounce authenticated users from
    // other /auth/* pages — we only want to narrow the exclusion, not
    // disable the guard wholesale.
    const response = await middleware(authRequest('/auth/login', 'GET'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBeTruthy();
  });

  it('still redirects an authenticated GET to /auth/forgot-password (control case)', async () => {
    const response = await middleware(authRequest('/auth/forgot-password', 'GET'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBeTruthy();
  });
});
