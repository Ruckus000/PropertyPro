import { createHmac } from 'node:crypto';
import { constantTimeEqual } from '@/lib/crypto/hmac-token';

function getStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error('OAUTH_STATE_SECRET is not configured');
  return secret;
}

export function signPayload(payload: string): string {
  return createHmac('sha256', getStateSecret())
    .update(payload)
    .digest('base64url');
}

export function verifySignature(payload: string, signature: string): boolean {
  return constantTimeEqual(signPayload(payload), signature);
}
