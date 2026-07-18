/**
 * Signed, no-login unsubscribe token for insurance renewal/expiry alerts.
 *
 * The alert emails are CAN-SPAM non-transactional, so they carry a one-click
 * List-Unsubscribe that must work WITHOUT a session. The token embeds the
 * community + user and is HMAC-signed so it can't be forged or enumerated.
 * Mirrors snowbird-digest-token.ts, but with its own secret so leaking or
 * rotating one feature's key never affects the other.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret(): string {
  const secret = process.env.INSURANCE_ALERTS_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('INSURANCE_ALERTS_UNSUBSCRIBE_SECRET is not configured');
  return secret;
}

export interface InsuranceAlertUnsubscribePayload {
  communityId: number;
  userId: string;
}

function encodePayload(payload: InsuranceAlertUnsubscribePayload): string {
  // Compact, URL-safe. userId is a UUID (no colons), so ':' is a safe delimiter.
  return Buffer.from(`${payload.communityId}:${payload.userId}`).toString('base64url');
}

/** Build the token: `<base64url(payload)>.<hmac>`. */
export function signInsuranceAlertUnsubscribeToken(payload: InsuranceAlertUnsubscribePayload): string {
  const encoded = encodePayload(payload);
  const sig = createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

/** Verify + decode a token. Returns null when malformed, forged, or tampered. */
export function verifyInsuranceAlertUnsubscribeToken(
  token: string,
): InsuranceAlertUnsubscribePayload | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  if (expectedSig.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const sep = decoded.indexOf(':');
  if (sep <= 0) return null;
  const communityId = Number(decoded.slice(0, sep));
  const userId = decoded.slice(sep + 1);
  if (!Number.isInteger(communityId) || communityId <= 0 || userId.length === 0) return null;

  return { communityId, userId };
}
