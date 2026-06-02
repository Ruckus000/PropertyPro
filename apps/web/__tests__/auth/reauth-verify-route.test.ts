/**
 * Route unit tests — `POST /api/v1/reauth/verify`.
 *
 * Added alongside Plan A1 drain #171. Session-anchored password re-auth with
 * pp-reauth cookie applied after `runRoute` on the outer response.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { REAUTH_COOKIE_NAME } from '@propertypro/shared';

const {
  requireAuthenticatedUserMock,
  signInWithPasswordMock,
  mintReauthCookieMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  mintReauthCookieMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
    },
  })),
}));

vi.mock('@/lib/api/reauth-guard', () => ({
  mintReauthCookie: mintReauthCookieMock,
}));

import { POST } from '../../src/app/api/v1/reauth/verify/route';

const URL = 'http://localhost:3000/api/v1/reauth/verify';

const COOKIE_PARAMS = {
  name: REAUTH_COOKIE_NAME,
  value: 'signed-jwt-token',
  httpOnly: true as const,
  secure: false,
  sameSite: 'lax' as const,
  maxAge: 900,
  path: '/' as const,
};

function jsonPost(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/reauth/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    requireAuthenticatedUserMock.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
    });
    signInWithPasswordMock.mockResolvedValue({ error: null });
    mintReauthCookieMock.mockResolvedValue(COOKIE_PARAMS);
  });

  it('verifies password, mints cookie, and returns ok payload', async () => {
    const response = await POST(jsonPost({ password: 'correct-password' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ ok: true });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'correct-password',
    });
    expect(mintReauthCookieMock).toHaveBeenCalledWith('user-123');
    expect(response.cookies.get(REAUTH_COOKIE_NAME)?.value).toBe('signed-jwt-token');
  });

  it('returns 401 when session user has no email', async () => {
    requireAuthenticatedUserMock.mockResolvedValueOnce({
      id: 'user-123',
      email: null,
    });

    const response = await POST(jsonPost({ password: 'secret' }));

    expect(response.status).toBe(401);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(mintReauthCookieMock).not.toHaveBeenCalled();
  });

  it('returns 401 when password is incorrect', async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
    });

    const response = await POST(jsonPost({ password: 'wrong' }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.message).toBe('Incorrect password');
    expect(mintReauthCookieMock).not.toHaveBeenCalled();
  });

  it('returns 401 without calling Supabase when unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(jsonPost({ password: 'secret' }));

    expect(response.status).toBe(401);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(mintReauthCookieMock).not.toHaveBeenCalled();
  });

  it('returns 400 for missing password without auth side effects', async () => {
    const response = await POST(jsonPost({}));

    expect(response.status).toBe(400);
    expect(requireAuthenticatedUserMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('returns 500 REAUTH_MISCONFIGURED when cookie mint fails', async () => {
    mintReauthCookieMock.mockRejectedValueOnce(new Error('secret too short'));

    const response = await POST(jsonPost({ password: 'correct-password' }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe('REAUTH_MISCONFIGURED');
    expect(response.cookies.get(REAUTH_COOKIE_NAME)).toBeUndefined();
  });
});
