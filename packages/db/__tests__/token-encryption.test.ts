import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptToken,
  encryptToken,
  getTokenEncryptionKeyFromEnv,
  parseTokenEncryptionKeyHex,
} from '../src/crypto/token-encryption';

const ORIGINAL_TOKEN_KEY = process.env.TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_TOKEN_KEY === undefined) {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_TOKEN_KEY;
  }
});

describe('token-encryption', () => {
  it('parses a valid 64-char hex key', () => {
    const key = parseTokenEncryptionKeyHex('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('rejects invalid key hex input', () => {
    expect(() => parseTokenEncryptionKeyHex('not-a-valid-key')).toThrow(
      'TOKEN_ENCRYPTION_KEY must be a 64-character hex string',
    );
  });

  it('requires TOKEN_ENCRYPTION_KEY in env', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => getTokenEncryptionKeyFromEnv()).toThrow('TOKEN_ENCRYPTION_KEY is required');
  });

  it('encrypts and decrypts token payloads', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const plaintext = 'refresh-token-example';

    const encrypted = encryptToken(plaintext);
    const decrypted = decryptToken(encrypted);

    expect(encrypted).not.toBe(plaintext);
    expect(decrypted).toBe(plaintext);
  });

  it('rejects tampered ciphertext payloads', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const encrypted = encryptToken('sensitive-token');

    const payload = Buffer.from(encrypted, 'base64');
    payload[payload.length - 1] = payload[payload.length - 1] ^ 0xff;
    const tampered = payload.toString('base64');

    expect(() => decryptToken(tampered)).toThrow('Failed to decrypt token payload');
  });
});
