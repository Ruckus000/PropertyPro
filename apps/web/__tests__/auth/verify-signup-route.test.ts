/**
 * Unit tests for GET /auth/verify-signup.
 *
 * The route exists so the verification email can link at our own domain instead
 * of `<project-ref>.supabase.co` — see the route's docblock and
 * `docs/audits/2026-09-11-signup-verification-deliverability.md`.
 *
 * The behaviour worth pinning is the one that is easy to get wrong later: it
 * redirects to the SAME place whether or not the token verifies, and it keeps
 * the session a good token produces (email-first signup needs it). That is not
 * laziness — `confirm-verification` reads `email_confirmed_at` and is the
 * authority, and it already owns a correct user-facing message and a Retry
 * button for the failure case. A route that rendered its own error would be a
 * second, divergent surface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyOtpMock, createServerClientMock } = vi.hoisted(() => {
  const verifyOtp = vi.fn();
  return {
    verifyOtpMock: verifyOtp,
    // Args are declared so `mock.calls[0][2]` is a real tuple element. With a
    // zero-arg `vi.fn(() => …)` the call tuple is `[]` and indexing it is a
    // type error no cast can rescue.
    createServerClientMock: vi.fn(
      (_url: string, _key: string, _options: unknown) => ({ auth: { verifyOtp } }),
    ),
  };
});

vi.mock('@supabase/ssr', () => ({ createServerClient: createServerClientMock }));

import { GET } from '../../src/app/auth/verify-signup/route';
import { SIGNUP_BINDING_COOKIE, sha256Hex } from '../../src/lib/auth/signup-binding';

const ORIGIN = 'https://www.getpropertypro.com';

function request(query: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}/auth/verify-signup${query}`, cookie ? { headers: { cookie } } : undefined);
}

/** An email-first link opened in the browser that requested it. */
const NONCE = 'browser-nonce-1';
async function boundRequest(query: string): Promise<NextRequest> {
  const b = await sha256Hex(NONCE);
  return request(`${query}&b=${b}`, `${SIGNUP_BINDING_COOKIE}=${NONCE}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyOtpMock.mockResolvedValue({ error: null });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

describe('GET /auth/verify-signup', () => {
  it('verifies the token and redirects to the signup return page', async () => {
    const res = await GET(request('?token_hash=abc&type=signup&signupRequestId=req-1'));

    expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: 'abc', type: 'signup' });

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') as string);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe('/signup');
    expect(location.searchParams.get('signupRequestId')).toBe('req-1');
    expect(location.searchParams.get('verified')).toBe('1');
    // The credential must not survive into the page the browser lands on.
    expect(location.searchParams.get('token_hash')).toBeNull();
  });

  it('verifies a magiclink token as a magiclink', async () => {
    // The already-registered fallback and every resend generate a magiclink.
    // Verifying one as type `signup` fails, and only on the rarer path.
    await GET(request('?token_hash=abc&type=magiclink&signupRequestId=req-1'));
    expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: 'abc', type: 'magiclink' });
  });

  it('still redirects when the token is spent or expired', async () => {
    verifyOtpMock.mockResolvedValue({ error: { message: 'Token has expired' } });

    const res = await GET(request('?token_hash=stale&type=signup&signupRequestId=req-1'));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') as string);
    expect(location.pathname).toBe('/signup');
    expect(location.searchParams.get('verified')).toBe('1');
  });

  it('refuses an unknown type without calling the SDK', async () => {
    const res = await GET(request('?token_hash=abc&type=recovery&signupRequestId=req-1'));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
  });

  it('redirects without calling the SDK when no token is present', async () => {
    const res = await GET(request('?signupRequestId=req-1'));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(new URL(res.headers.get('location') as string).pathname).toBe('/signup');
  });

  it('keeps the session: writes the auth cookies onto the redirect', async () => {
    // Email-first signup answers the community questions signed in, and
    // POST /auth/signup/details is session-authenticated.
    verifyOtpMock.mockImplementation(async () => {
      const options = createServerClientMock.mock.calls[0]?.[2] as {
        cookies: { setAll: (c: Array<{ name: string; value: string; options?: object }>) => void };
      };
      options.cookies.setAll([{ name: 'sb-project-auth-token', value: 'session', options: { path: '/' } }]);
      return { error: null };
    });

    const res = await GET(await boundRequest('?token_hash=abc&type=signup'));

    expect(res.cookies.get('sb-project-auth-token')?.value).toBe('session');
    expect(new URL(res.headers.get('location') as string).searchParams.get('signupRequestId')).toBeNull();
    // Spent: the binding cookie is expired so the link cannot be replayed here.
    expect(res.cookies.get(SIGNUP_BINDING_COOKIE)?.value).toBe('');
  });

  describe('an email-first link opened in a browser that did not request it', () => {
    // Otherwise a link an attacker requested for their own address would sign
    // in whoever they lured into opening it (login CSRF).
    it.each([
      ['no binding cookie', () => request(`?token_hash=abc&type=magiclink&b=${'a'.repeat(64)}`)],
      ['a different browser\'s cookie', async () =>
        request(`?token_hash=abc&type=magiclink&b=${await sha256Hex('attacker-nonce')}`, `${SIGNUP_BINDING_COOKIE}=victim-nonce`)],
      ['no b parameter at all', () => request('?token_hash=abc&type=magiclink', `${SIGNUP_BINDING_COOKIE}=${NONCE}`)],
    ])('with %s: does not verify, sets no session, and says why', async (_label, make) => {
      const res = await GET(await make());
      expect(verifyOtpMock).not.toHaveBeenCalled();
      expect(res.cookies.getAll()).toEqual([]);
      const location = new URL(res.headers.get('location') as string);
      expect(location.pathname).toBe('/signup');
      expect(location.searchParams.get('link')).toBe('other-device');
      expect(location.searchParams.get('token_hash')).toBeNull();
    });
  });

  it('still discards the session for a form-flow link (it carries a signupRequestId)', async () => {
    verifyOtpMock.mockImplementation(async () => {
      const options = createServerClientMock.mock.calls[0]?.[2] as {
        cookies: { setAll: (c: Array<{ name: string; value: string; options?: object }>) => void };
      };
      options.cookies.setAll([{ name: 'sb-project-auth-token', value: 'session', options: { path: '/' } }]);
      return { error: null };
    });

    const res = await GET(request('?token_hash=abc&type=signup&signupRequestId=req-1'));

    expect(res.cookies.getAll()).toEqual([]);
  });

  it('sets no cookies when the token fails', async () => {
    verifyOtpMock.mockResolvedValue({ error: { message: 'Token has expired' } });
    const res = await GET(await boundRequest('?token_hash=stale&type=signup'));
    expect(res.cookies.getAll()).toEqual([]);
  });

  it('marks the response no-store, since the URL carried a credential', async () => {
    const res = await GET(request('?token_hash=abc&type=signup&signupRequestId=req-1'));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
