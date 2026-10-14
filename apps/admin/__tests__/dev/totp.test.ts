/**
 * The dev-login TOTP helper against the RFC 6238 Appendix B SHA-1 vectors
 * (truncated to 6 digits). If this drifts, `/dev/agent-login` cannot reach
 * aal2 and every admin e2e spec bounces to `/auth/mfa`.
 */
import { describe, expect, it } from 'vitest';
import { totpCode } from '@/lib/dev/totp';

// base32("12345678901234567890"), the RFC 6238 SHA-1 seed.
const SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totpCode', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('T=%i gives %s', (seconds, expected) => {
    expect(totpCode(SEED, seconds * 1000)).toBe(expected);
  });

  it('rejects a secret that is not base32', () => {
    expect(() => totpCode('not base32!')).toThrow('Invalid base32 secret');
  });
});
