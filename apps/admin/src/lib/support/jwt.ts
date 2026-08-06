/**
 * JWT signing utility for support access sessions.
 *
 * Signs a short-lived token (SUPPORT_SESSION_MAX_TTL_HOURS) that the admin app issues when a
 * support session is created. The token is verified by the web app's
 * support-access middleware to grant a scoped impersonation session.
 *
 * Secret: SUPPORT_SESSION_JWT_SECRET environment variable (min 32 chars),
 * REQUIRED in every environment. Generate one with `openssl rand -hex 32` and
 * set the SAME value on the admin app (which signs) and the web app (which
 * verifies).
 *
 * There is deliberately no development fallback. A previous version fell back
 * to a constant checked into the repo whenever NODE_ENV !== 'production',
 * which made this token forgeable by anyone in any such environment. Failing
 * closed — support access simply does not work until a secret is configured —
 * is the correct behaviour. See packages/shared/src/support-access.ts.
 */
import { SignJWT } from 'jose';
import { AppError } from '@propertypro/shared/http';
import {
  SUPPORT_SESSION_MAX_TTL_HOURS,
  type SupportSessionJwtPayload,
} from '@propertypro/shared';

function getSecret(): Uint8Array {
  const secret = process.env.SUPPORT_SESSION_JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new AppError(
      'Support access is not configured: SUPPORT_SESSION_JWT_SECRET is missing or shorter than 32 characters.',
      500,
      'SERVER_MISCONFIGURED',
    );
  }

  return new TextEncoder().encode(secret);
}

type SignPayload = Omit<SupportSessionJwtPayload, 'exp' | 'iat'>;

/**
 * Sign a support-access JWT valid for SUPPORT_SESSION_MAX_TTL_HOURS hours (currently 30 min).
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
    // Identity of the impersonated user, resolved once here so the web
    // middleware never has to query per request. `null` is meaningful and is
    // preserved: it tells the verifier "resolved, but unknown", which still
    // clears the admin's identity rather than leaking it.
    target_name: payload.target_name ?? null,
    target_email: payload.target_email ?? null,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ttlSeconds === 0 ? '0s' : `${ttlSeconds}s`)
    .sign(secret);
}
