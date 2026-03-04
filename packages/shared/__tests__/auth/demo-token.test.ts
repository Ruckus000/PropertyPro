import { describe, expect, it } from 'vitest';
import {
  generateDemoToken,
  validateDemoToken,
  extractDemoIdFromToken,
} from '../../src/auth/demo-token';

const SECRET = 'test-secret-key-32-chars-minimum!';
const BASE_PARAMS = {
  demoId: 42,
  userId: 'user-uuid-1234',
  role: 'resident' as const,
  secret: SECRET,
  ttlSeconds: 3600,
};

describe('generateDemoToken', () => {
  it('produces a string with exactly one dot separator', () => {
    const token = generateDemoToken(BASE_PARAMS);
    const dots = token.split('.').length - 1;
    expect(dots).toBe(1);
  });
});

describe('validateDemoToken', () => {
  it('returns payload with correct fields for a valid token', () => {
    const token = generateDemoToken(BASE_PARAMS);
    const result = validateDemoToken(token, SECRET);
    expect(result).not.toBeNull();
    expect(result?.demoId).toBe(42);
    expect(result?.userId).toBe('user-uuid-1234');
    expect(result?.role).toBe('resident');
    expect(typeof result?.exp).toBe('number');
  });

  it('returns null for wrong secret', () => {
    const token = generateDemoToken(BASE_PARAMS);
    const result = validateDemoToken(token, 'wrong-secret');
    expect(result).toBeNull();
  });

  it('returns null for expired token (ttlSeconds: -1)', () => {
    const token = generateDemoToken({ ...BASE_PARAMS, ttlSeconds: -1 });
    const result = validateDemoToken(token, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for tampered payload', () => {
    const token = generateDemoToken(BASE_PARAMS);
    const [payloadB64, sig] = token.split('.');
    // Modify the payload by appending a character
    const tampered = `${payloadB64}X.${sig}`;
    const result = validateDemoToken(tampered, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for malformed tokens (no dot, empty string, random string)', () => {
    expect(validateDemoToken('nodothere', SECRET)).toBeNull();
    expect(validateDemoToken('', SECRET)).toBeNull();
    expect(validateDemoToken('random.garbage.extra', SECRET)).toBeNull();
  });

  it('returns null when signature length mismatches expected length', () => {
    const token = generateDemoToken(BASE_PARAMS);
    const [payloadB64] = token.split('.');
    const shortSig = 'AA';
    const result = validateDemoToken(`${payloadB64}.${shortSig}`, SECRET);
    expect(result).toBeNull();
  });
});

describe('extractDemoIdFromToken', () => {
  it('returns correct demoId without needing the secret', () => {
    const token = generateDemoToken(BASE_PARAMS);
    const demoId = extractDemoIdFromToken(token);
    expect(demoId).toBe(42);
  });

  it('returns null for garbage input', () => {
    expect(extractDemoIdFromToken('notavalidtoken')).toBeNull();
    expect(extractDemoIdFromToken('')).toBeNull();
    expect(extractDemoIdFromToken('abc.!!!')).toBeNull();
  });
});

describe('timing safety', () => {
  it('validateDemoToken with wrong secret takes similar time as correct secret', async () => {
    const token = generateDemoToken(BASE_PARAMS);
    const iterations = 100;

    const timeValidation = (secret: string) => {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        validateDemoToken(token, secret);
      }
      return performance.now() - start;
    };

    const validTime = timeValidation(SECRET);
    const invalidTime = timeValidation('wrong-secret-key-32-chars-minimum!');

    // Both should complete (no early exit that would cause wildly different times).
    // We allow a generous 10x ratio since timing is environment-dependent,
    // but the implementation uses timingSafeEqual which prevents trivial early exits.
    const ratio = Math.max(validTime, invalidTime) / Math.min(validTime, invalidTime);
    expect(ratio).toBeLessThan(10);
  });
});
