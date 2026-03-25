/**
 * JWT signing utility for support access sessions.
 *
 * Signs a short-lived token (1 hour) that the admin app issues when a
 * support session is created.  The token is verified by the web app's
 * support-access middleware to grant a scoped impersonation session.
 *
 * Secret: SUPPORT_JWT_SECRET environment variable (min 32 chars).
 */
import { SignJWT } from 'jose';

export interface SupportTokenPayload {
  sessionId: string;
  adminId: string;
  communityId: number;
  targetUserId: string;
}

/**
 * Sign a support-access JWT valid for 1 hour.
 * Returns the signed JWT string.
 */
export async function signSupportToken(payload: SupportTokenPayload): Promise<string> {
  const secret = process.env.SUPPORT_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SUPPORT_JWT_SECRET is not set or is too short (min 32 chars)');
  }

  const encoded = new TextEncoder().encode(secret);

  return new SignJWT({
    sid: payload.sessionId,
    aid: payload.adminId,
    cid: payload.communityId,
    uid: payload.targetUserId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setSubject(payload.targetUserId)
    .sign(encoded);
}
