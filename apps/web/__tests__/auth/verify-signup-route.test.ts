/**
 * Unit tests for GET /auth/verify-signup.
 *
 * The route exists so the verification email can link at our own domain instead
 * of `<project-ref>.supabase.co` — see the route's docblock and
 * `docs/audits/2026-09-11-signup-verification-deliverability.md`.
 *
 * The behaviour worth pinning is the one that is easy to get wrong later: it
 * redirects to the SAME place whether or not the token verifies. That is not
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

const ORIGIN = 'https://www.getpropertypro.com';

function request(query: string): NextRequest {
  return new NextRequest(`${ORIGIN}/auth/verify-signup${query}`);
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

  it('writes no auth cookies — the session is discarded', async () => {
    await GET(request('?token_hash=abc&type=signup&signupRequestId=req-1'));

    const options = createServerClientMock.mock.calls[0]?.[2] as {
      cookies: { getAll: () => unknown[]; setAll: (c: unknown[]) => void };
    };
    expect(options.cookies.getAll()).toEqual([]);
    // Nothing downstream needs a session: signup-form.tsx confirms with a
    // signupRequestId and /signup/checkout is public.
    expect(() => options.cookies.setAll([{ name: 'sb-x', value: 'y' }])).not.toThrow();
  });

  it('marks the response no-store, since the URL carried a credential', async () => {
    const res = await GET(request('?token_hash=abc&type=signup&signupRequestId=req-1'));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
