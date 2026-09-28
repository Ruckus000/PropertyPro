/**
 * The one HMAC-token primitive for signed, no-login links (unsubscribe tokens)
 * and the one constant-time string comparison (roadmap 2.9 / SVC-05).
 *
 * Why it exists: the same sign/verify block had been copied into three token
 * files, and every copy — plus `oauth-state.ts` and the support-inbox webhook —
 * guarded `timingSafeEqual` with a STRING-length check. `timingSafeEqual`
 * compares BYTE lengths and THROWS when they differ, so a signature of the
 * right string length containing one non-ASCII character (43 chars, 44 bytes)
 * escaped the guard and surfaced as an unhandled 500 instead of a refusal. It
 * failed closed — nothing could be forged — but a crafted link could 500 the
 * route. `constantTimeEqual` compares the buffers' byte lengths first.
 *
 * Callers keep their own secret, their own unset-secret policy (throw vs
 * return null) and their own payload encoding; only the signing and the
 * comparison live here.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Constant-time string equality. Never throws: unequal byte lengths are simply unequal. */
export function constantTimeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function hmac(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

/** Build `<encoded>.<base64url(hmac-sha256(encoded))>`. */
export function signHmacToken(encoded: string, secret: string): string {
  return `${encoded}.${hmac(encoded, secret)}`;
}

/**
 * Verify a token built by `signHmacToken` and return its encoded payload, or
 * `null` when it is malformed, forged or tampered with. Decoding the payload is
 * the caller's job.
 */
export function openHmacToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (sig.length === 0) return null;
  return constantTimeEqual(hmac(encoded, secret), sig) ? encoded : null;
}
