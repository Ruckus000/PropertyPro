import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const DEMO_SECRET_PREFIX = 'enc:v1:';
const DEMO_SECRET_PART_COUNT = 5;
const AES_256_KEY_HEX_LENGTH = 64;
const GCM_IV_LENGTH_BYTES = 12;
const GCM_AUTH_TAG_LENGTH_BYTES = 16;

function parseEncryptionKey(keyHex: string): Buffer | null {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    return null;
  }

  const key = Buffer.from(keyHex, 'hex');
  return key.length === AES_256_KEY_HEX_LENGTH / 2 ? key : null;
}

function requireEncryptionKey(keyHex: string): Buffer {
  const key = parseEncryptionKey(keyHex);
  if (!key) {
    throw new Error('DEMO_TOKEN_ENCRYPTION_KEY_HEX must be a 64-character hex string');
  }

  return key;
}

/**
 * Encrypt demo HMAC secret with AES-256-GCM.
 *
 * Returns an encoded payload in format:
 * enc:v1:<iv_b64url>:<ciphertext_b64url>:<tag_b64url>
 */
export function encryptDemoTokenSecret(secret: string, keyHex: string): string {
  const key = requireEncryptionKey(keyHex);
  const iv = randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${DEMO_SECRET_PREFIX}${iv.toString('base64url')}:${ciphertext.toString('base64url')}:${authTag.toString('base64url')}`;
}

/**
 * Decrypt demo HMAC secret.
 *
 * - `enc:v1:*` payloads are decrypted; returns null when key/payload is invalid.
 * - Non-prefixed payloads are treated as legacy plaintext and returned as-is.
 */
export function decryptDemoTokenSecret(stored: string, keyHex: string): string | null {
  if (!stored.startsWith(DEMO_SECRET_PREFIX)) {
    return stored;
  }

  const key = parseEncryptionKey(keyHex);
  if (!key) {
    return null;
  }

  const parts = stored.split(':');
  if (parts.length !== DEMO_SECRET_PART_COUNT) {
    return null;
  }

  const [, version, ivB64, ciphertextB64, authTagB64] = parts;
  if (version !== 'v1' || !ivB64 || !ciphertextB64 || !authTagB64) {
    return null;
  }

  try {
    const iv = Buffer.from(ivB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');

    if (iv.length !== GCM_IV_LENGTH_BYTES || authTag.length !== GCM_AUTH_TAG_LENGTH_BYTES) {
      return null;
    }

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}
