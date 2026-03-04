import { describe, expect, it } from 'vitest';
import { decryptDemoTokenSecret, encryptDemoTokenSecret } from '../../src/auth/demo-secret';

const KEY_HEX = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const WRONG_KEY_HEX = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';

describe('demo secret encryption', () => {
  it('encrypt/decrypt roundtrip succeeds', () => {
    const secret = 'demo-token-secret-123';
    const encrypted = encryptDemoTokenSecret(secret, KEY_HEX);

    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toContain(secret);
    expect(decryptDemoTokenSecret(encrypted, KEY_HEX)).toBe(secret);
  });

  it('returns null when decrypting with the wrong key', () => {
    const encrypted = encryptDemoTokenSecret('demo-token-secret-123', KEY_HEX);
    expect(decryptDemoTokenSecret(encrypted, WRONG_KEY_HEX)).toBeNull();
  });

  it('returns null for malformed encrypted payloads', () => {
    expect(decryptDemoTokenSecret('enc:v1:invalid', KEY_HEX)).toBeNull();
    expect(decryptDemoTokenSecret('enc:v1:iv:cipher:tag:extra', KEY_HEX)).toBeNull();
  });

  it('passes through legacy plaintext values unchanged', () => {
    expect(decryptDemoTokenSecret('legacy-plaintext-secret', KEY_HEX)).toBe('legacy-plaintext-secret');
  });
});
