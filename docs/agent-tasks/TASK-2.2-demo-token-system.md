# Task 2.2 — Demo Auto-Auth Token System

> **Context files to read first:** `SHARED-CONTEXT.md`
> **Branch:** `feat/demo-tokens`
> **Estimated time:** 1-2 hours
> **Wave 4** — can run in parallel with 2.1 and 2.4-2.6. No shared files.

## Objective

Create the HMAC-based token generation and validation system for demo auto-authentication. This is a pure library — no API routes, no UI.

## Deliverables

### 1. Token library

**Create:** `packages/shared/src/auth/demo-token.ts`

```typescript
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

  // Timing-safe comparison
  try {
    const sigBuf = Buffer.from(sig, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
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
```

### 2. Export

Add exports to `packages/shared/src/index.ts`:
```typescript
export { generateDemoToken, validateDemoToken, extractDemoIdFromToken } from './auth/demo-token';
```

### 3. Unit tests

**Create:** `packages/shared/__tests__/auth/demo-token.test.ts`

Test cases:
1. `generateDemoToken` → produces a string with exactly one `.` separator
2. `validateDemoToken` with correct secret → returns payload with correct fields
3. `validateDemoToken` with wrong secret → returns null
4. `validateDemoToken` with expired token (ttlSeconds: -1) → returns null
5. `validateDemoToken` with tampered payload (modify base64 after generation) → returns null
6. `validateDemoToken` with malformed token (no dot, empty string, random string) → returns null
7. `extractDemoIdFromToken` → returns correct demoId without needing secret
8. `extractDemoIdFromToken` with garbage → returns null
9. Timing: `validateDemoToken` with wrong secret takes similar time as correct secret (timing-safe)

## TTL Constants (for reference by other tasks)

These are NOT exported as constants — callers pass `ttlSeconds` explicitly:
- Shareable links: 3600 (1 hour)
- Admin preview iframes: 86400 (24 hours)

## Do NOT

- Do not create API routes — the auto-auth endpoint is in Task 2.3/2.7
- Do not import anything from `@propertypro/db` — this is a pure utility
- Do not store tokens in a database — they are stateless (HMAC-verified)

## Acceptance Criteria

- [ ] Token generation produces valid format
- [ ] Validation accepts valid tokens, rejects invalid/expired/tampered
- [ ] Timing-safe comparison used for HMAC verification
- [ ] `extractDemoIdFromToken` works without the secret
- [ ] All 9 tests pass
- [ ] `pnpm typecheck` passes
