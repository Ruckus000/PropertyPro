import { describe, expect, it } from 'vitest';
import { constantTimeEqual, openHmacToken, signHmacToken } from '../hmac-token';

/**
 * Roadmap 2.9 / SVC-05. The byte-length case is the bug the consolidation
 * fixes: a signature of the right STRING length but a different BYTE length
 * made `timingSafeEqual` throw (a 500) instead of refusing. Revert-check: make
 * `constantTimeEqual` compare string lengths again and "never throws" goes red.
 */
const SECRET = 'test-secret';
const ENCODED = Buffer.from('42:5f1c2c1e-0000-4000-8000-000000000001').toString('base64url');

describe('signHmacToken / openHmacToken', () => {
  it('round-trips the encoded payload', () => {
    expect(openHmacToken(signHmacToken(ENCODED, SECRET), SECRET)).toBe(ENCODED);
  });

  it('refuses a tampered payload, a wrong secret and a malformed token', () => {
    const token = signHmacToken(ENCODED, SECRET);
    const sig = token.slice(token.lastIndexOf('.') + 1);
    expect(openHmacToken(`${ENCODED}x.${sig}`, SECRET)).toBeNull();
    expect(openHmacToken(token, 'other-secret')).toBeNull();
    expect(openHmacToken(ENCODED, SECRET)).toBeNull(); // no dot
    expect(openHmacToken(`.${sig}`, SECRET)).toBeNull(); // empty payload
    expect(openHmacToken(`${ENCODED}.`, SECRET)).toBeNull(); // empty signature
  });

  it('refuses — never throws on — a same-length signature with a non-ASCII character', () => {
    const token = signHmacToken(ENCODED, SECRET);
    const dot = token.lastIndexOf('.');
    const sig = token.slice(dot + 1);
    const forged = `${ENCODED}.é${sig.slice(1)}`; // same string length, one byte longer
    expect(forged.length).toBe(token.length);
    expect(() => openHmacToken(forged, SECRET)).not.toThrow();
    expect(openHmacToken(forged, SECRET)).toBeNull();
  });
});

describe('constantTimeEqual', () => {
  it('compares by value and never throws on differing byte lengths', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(() => constantTimeEqual('abc', 'abé')).not.toThrow();
    expect(constantTimeEqual('abc', 'abé')).toBe(false);
  });
});
