import { beforeEach, describe, expect, it, vi } from 'vitest';

// Wraps the real `timingSafeEqual` rather than replacing it: the comparison
// still genuinely runs, we just get to observe THAT it ran and with what.
// `vi.hoisted` is required because `vi.mock` factories are hoisted above imports.
const { timingSafeEqualSpy } = vi.hoisted(() => ({
  timingSafeEqualSpy: vi.fn<(a: Buffer, b: Buffer) => void>(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    timingSafeEqual: (a: Buffer, b: Buffer) => {
      timingSafeEqualSpy(a, b);
      return actual.timingSafeEqual(a, b);
    },
  };
});

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

/**
 * Timing safety is asserted STRUCTURALLY — by observing that the constant-time
 * comparison actually runs — not by wall-clocking two loops and comparing them.
 *
 * The previous version timed 100 iterations with a correct secret, 100 with a
 * wrong one, and required the ratio to stay under 10x. It failed in CI on
 * 2026-08-07 with a ratio of 16.1 (job 92734525392), because two jobs were
 * sharing one 8-vCPU machine and a scheduler preemption landed in one loop and
 * not the other. Nothing about the implementation had changed.
 *
 * That measurement could not have worked. Two sub-millisecond loops on a shared
 * CPU measure scheduler noise and JIT warmup — the first loop always pays to
 * compile `validateDemoToken` — far more than they measure the comparison. It
 * passed on GitHub's runners by luck, and raising the threshold would only have
 * bought a quieter kind of luck.
 *
 * What follows tests strictly MORE than the timing version did, and does it
 * deterministically. `validateDemoToken` makes two promises that matter here,
 * and the old test verified neither:
 *
 *   1. A wrong secret still reaches `timingSafeEqual` — it does not bail out
 *      early on a cheap mismatch, which is the actual "takes similar time"
 *      property.
 *   2. A length-mismatched signature still performs a dummy `timingSafeEqual`,
 *      so the expected signature's LENGTH does not leak either.
 */
describe('timing safety', () => {
  beforeEach(() => {
    timingSafeEqualSpy.mockClear();
  });

  it('reaches the constant-time comparison for a WRONG secret, rather than bailing out early', () => {
    const token = generateDemoToken(BASE_PARAMS);

    expect(validateDemoToken(token, 'wrong-secret-key-32-chars-minimum!')).toBeNull();

    // The early-exit an attacker would time is one that returns before ever
    // comparing. Reaching the comparison at all is the property.
    expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1);
    const [a, b] = timingSafeEqualSpy.mock.calls[0]!;
    expect(a).toHaveLength(b.length);
    // A real comparison of two DIFFERENT buffers — not the dummy self-compare.
    expect(a.equals(b)).toBe(false);
  });

  it('performs the same comparison for a correct secret', () => {
    const token = generateDemoToken(BASE_PARAMS);

    expect(validateDemoToken(token, SECRET)).not.toBeNull();

    expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1);
    const [a, b] = timingSafeEqualSpy.mock.calls[0]!;
    expect(a.equals(b)).toBe(true);
  });

  it('still compares when the signature LENGTH differs, so length does not leak', () => {
    const token = generateDemoToken(BASE_PARAMS);
    const [payloadB64] = token.split('.');
    // A signature that is well-formed base64url but far too short.
    const shortSig = Buffer.from('short').toString('base64url');

    expect(validateDemoToken(`${payloadB64}.${shortSig}`, SECRET)).toBeNull();

    // The dummy self-comparison documented in demo-token.ts: same buffer twice.
    expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1);
    const [a, b] = timingSafeEqualSpy.mock.calls[0]!;
    expect(a.equals(b)).toBe(true);
  });
});
