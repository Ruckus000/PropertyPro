import { createHmac, timingSafeEqual } from 'node:crypto';

interface TokenPayload {
  demoId: number;
  userId: string;
  role: 'resident' | 'board';
  exp: number;  // Unix timestamp (seconds)
}

/**
 * Generate a signed demo auto-auth token.
 *
 * Format: base64url(JSON(payload)).base64url(HMAC-SHA256(payload, secret))
 */
export function generateDemoToken(params: {
  demoId: number;
  userId: string;
  role: 'resident' | 'board';
  secret: string;
  ttlSeconds: number;
}): string {
  const payload: TokenPayload = {
    demoId: params.demoId,
    userId: params.userId,
    role: params.role,
    exp: Math.floor(Date.now() / 1000) + params.ttlSeconds,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', params.secret).update(payloadB64).digest('base64url');

  return `${payloadB64}.${sig}`;
}

/**
 * Validate and decode a demo token.
 *
 * Returns the decoded payload if valid, or null if:
 * - Token format is invalid
 * - HMAC signature doesn't match
 * - Token is expired
 */
export function validateDemoToken(
  token: string,
  secret: string,
): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  // Verify HMAC
  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url');

  // Timing-safe comparison.
  // When lengths differ, perform a dummy comparison to prevent timing side-channels
  // that could reveal the expected signature length.
  try {
    const sigBuf = Buffer.from(sig, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');

    if (sigBuf.length !== expectedBuf.length) {
      timingSafeEqual(expectedBuf, expectedBuf);
      return null;
    }

    if (!timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  // Decode payload
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }

  // Check required fields
  if (
    typeof payload.demoId !== 'number' ||
    typeof payload.userId !== 'string' ||
    (payload.role !== 'resident' && payload.role !== 'board') ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  // Check expiry
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

/**
 * Extract demoId from a token WITHOUT verifying the signature.
 * Used to look up the HMAC secret from the database before full validation.
 */
export function extractDemoIdFromToken(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0]) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    return typeof payload.demoId === 'number' ? payload.demoId : null;
  } catch {
    return null;
  }
}
