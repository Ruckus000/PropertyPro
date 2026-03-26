import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { REAUTH_COOKIE_NAME } from '@propertypro/shared';
import { ReauthRequiredError } from './errors';

/** 15-minute validity window for a re-auth cookie (seconds). */
const REAUTH_JWT_TTL_SECONDS = 900;

/** Dev-only fallback secret — never used in production. */
const DEV_SECRET = 'propertypro-local-reauth-secret-2026-dev-only';

function getReauthSecret(): Uint8Array {
  const secret = process.env.REAUTH_JWT_SECRET;
  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV !== 'production') {
    return new TextEncoder().encode(DEV_SECRET);
  }
  throw new Error('REAUTH_JWT_SECRET must be set in production (min 32 chars)');
}

/**
 * Mint a short-lived JWT and return the cookie parameters.
 * Call this from the POST /api/v1/reauth/verify route handler.
 */
export async function mintReauthCookie(userId: string): Promise<{
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: '/';
}> {
  const secret = getReauthSecret();
  const token = await new SignJWT({ type: 'reauth' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${REAUTH_JWT_TTL_SECONDS}s`)
    .sign(secret);

  return {
    name: REAUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REAUTH_JWT_TTL_SECONDS,
    path: '/',
  };
}

/**
 * Assert that a valid pp-reauth cookie is present for the current user.
 * Throws ReauthRequiredError (403) if missing, expired, or bound to a
 * different user than the active session.
 *
 * Call this at the top of sensitive route handlers AFTER requireAuthenticatedUserId.
 */
export async function requireFreshReauth(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(REAUTH_COOKIE_NAME)?.value;

  if (!token) {
    throw new ReauthRequiredError();
  }

  let payload: { sub?: string; type?: unknown };
  try {
    const result = await jwtVerify(token, getReauthSecret());
    payload = result.payload as { sub?: string; type?: unknown };
  } catch {
    throw new ReauthRequiredError();
  }

  if (payload.sub !== userId || payload.type !== 'reauth') {
    throw new ReauthRequiredError();
  }
}
