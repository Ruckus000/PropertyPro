// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { ReauthRequiredError } from '../errors';
import { requireFreshReauth, mintReauthCookie } from '../reauth-guard';

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';

const DEV_SECRET = new TextEncoder().encode('propertypro-local-reauth-secret-2026-dev-only');
const USER_ID = 'user-abc-123';

describe('ReauthRequiredError', () => {
  it('has status 403 and code REAUTH_REQUIRED', () => {
    const err = new ReauthRequiredError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('REAUTH_REQUIRED');
    expect(err.name).toBe('ReauthRequiredError');
  });
});

async function makeValidToken(userId = USER_ID, ttl = 900): Promise<string> {
  return new SignJWT({ type: 'reauth' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(DEV_SECRET);
}

describe('requireFreshReauth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('passes when a valid cookie exists for the user', async () => {
    const token = await makeValidToken();
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) => (name === 'pp-reauth' ? { name, value: token } : undefined),
    } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never);

    await expect(requireFreshReauth(USER_ID)).resolves.toBeUndefined();
  });

  it('throws ReauthRequiredError when cookie is absent', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: () => undefined,
    } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never);

    await expect(requireFreshReauth(USER_ID)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
  });

  it('throws ReauthRequiredError when token is for a different user', async () => {
    const token = await makeValidToken('other-user');
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) => (name === 'pp-reauth' ? { name, value: token } : undefined),
    } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never);

    await expect(requireFreshReauth(USER_ID)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
  });

  it('throws ReauthRequiredError when token is expired', async () => {
    const token = await makeValidToken(USER_ID, -1); // already expired
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) => (name === 'pp-reauth' ? { name, value: token } : undefined),
    } as ReturnType<typeof cookies> extends Promise<infer T> ? T : never);

    await expect(requireFreshReauth(USER_ID)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
  });
});

describe('mintReauthCookie', () => {
  it('returns a cookie with correct name and maxAge', async () => {
    const cookie = await mintReauthCookie(USER_ID);
    expect(cookie.name).toBe('pp-reauth');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.maxAge).toBe(900);
  });
});
