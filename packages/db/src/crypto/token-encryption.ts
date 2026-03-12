import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const AES_256_GCM_KEY_HEX_LENGTH = 64;
const GCM_IV_LENGTH_BYTES = 12;
const GCM_AUTH_TAG_LENGTH_BYTES = 16;

function isValidKeyHex(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

function toBytes(value: ArrayLike<number>): Uint8Array {
  return Uint8Array.from(value);
}

export function parseTokenEncryptionKeyHex(keyHex: string): Uint8Array {
  if (!isValidKeyHex(keyHex)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string');
  }

  const key = toBytes(Buffer.from(keyHex, 'hex'));
  if (key.length !== AES_256_GCM_KEY_HEX_LENGTH / 2) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  }

  return key;
}

export function getTokenEncryptionKeyFromEnv(): Uint8Array {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required');
  }

  return parseTokenEncryptionKeyHex(keyHex);
}

/**
 * Encrypt a token using AES-256-GCM.
 *
 * Storage format: base64(iv(12) + ciphertext + authTag(16)).
 */
export function encryptToken(plaintext: string): string {
  const key = getTokenEncryptionKeyFromEnv();
  const iv = toBytes(randomBytes(GCM_IV_LENGTH_BYTES));

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encryptedChunk = toBytes(cipher.update(plaintext, 'utf8'));
  const finalEncryptedChunk = toBytes(cipher.final());
  const ciphertext = new Uint8Array(encryptedChunk.length + finalEncryptedChunk.length);
  ciphertext.set(encryptedChunk, 0);
  ciphertext.set(finalEncryptedChunk, encryptedChunk.length);
  const authTag = toBytes(cipher.getAuthTag());

  const payload = new Uint8Array(iv.length + ciphertext.length + authTag.length);
  payload.set(iv, 0);
  payload.set(ciphertext, iv.length);
  payload.set(authTag, iv.length + ciphertext.length);

  return Buffer.from(payload).toString('base64');
}

/**
 * Decrypt a token encoded as base64(iv + ciphertext + authTag).
 */
export function decryptToken(ciphertextBase64: string): string {
  const key = getTokenEncryptionKeyFromEnv();

  let payload: Uint8Array;
  try {
    payload = toBytes(Buffer.from(ciphertextBase64, 'base64'));
  } catch {
    throw new Error('Invalid encrypted token payload');
  }

  if (payload.length < GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES + 1) {
    throw new Error('Invalid encrypted token payload');
  }

  const iv = payload.subarray(0, GCM_IV_LENGTH_BYTES);
  const authTag = payload.subarray(payload.length - GCM_AUTH_TAG_LENGTH_BYTES);
  const ciphertext = payload.subarray(
    GCM_IV_LENGTH_BYTES,
    payload.length - GCM_AUTH_TAG_LENGTH_BYTES,
  );

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decryptedChunk = toBytes(decipher.update(ciphertext));
    const finalDecryptedChunk = toBytes(decipher.final());
    const plaintextBytes = new Uint8Array(decryptedChunk.length + finalDecryptedChunk.length);
    plaintextBytes.set(decryptedChunk, 0);
    plaintextBytes.set(finalDecryptedChunk, decryptedChunk.length);
    return new TextDecoder().decode(plaintextBytes);
  } catch {
    throw new Error('Failed to decrypt token payload');
  }
}
