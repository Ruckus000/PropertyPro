/**
 * JWT signing utility for support access sessions.
 *
 * Signs a short-lived token (1 hour) that the admin app issues when a
 * support session is created. The token is verified by the web app's
 * support-access middleware to grant a scoped impersonation session.
 *
 * Secret: SUPPORT_SESSION_JWT_SECRET environment variable (min 32 chars).
 */
import { SignJWT } from 'jose';
import type { SupportSessionJwtPayload } from '@propertypro/shared';
import { SUPPORT_SESSION_MAX_TTL_HOURS } from '@propertypro/shared';

function getSecret(): Uint8Array {
  const secret = process.env.SUPPORT_SESSION_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SUPPORT_SESSION_JWT_SECRET is not set or is too short (min 32 chars)');
  }
  return new TextEncoder().encode(secret);
}

type SignPayload = Omit<SupportSessionJwtPayload, 'exp' | 'iat'>;

/**
 * Sign a support-access JWT valid for 1 hour.
 * Uses RFC 8693 `act` claim to identify the impersonating admin.
 */
export async function signSupportToken(
  payload: SignPayload,
  ttlSeconds: number = SUPPORT_SESSION_MAX_TTL_HOURS * 3600,
): Promise<string> {
  const secret = getSecret();

  return new SignJWT({
    act: payload.act,
    community_id: payload.community_id,
    session_id: payload.session_id,
    scope: payload.scope,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ttlSeconds === 0 ? '0s' : `${ttlSeconds}s`)
    .sign(secret);
}
