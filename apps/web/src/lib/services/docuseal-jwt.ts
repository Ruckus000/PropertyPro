/**
 * JWT generation for DocuSeal Builder authentication.
 *
 * The DocuSeal embedded builder component requires a JWT token signed
 * with the API key. This module generates short-lived tokens for
 * template creation and editing.
 */
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BuilderTokenPayload {
  user_email: string;
  integration_email: string;
  external_id?: string;
  folder_name?: string;
  name?: string;
}

interface JwtHeader {
  alg: 'HS256';
  typ: 'JWT';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createHmacSignature(data: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/**
 * Generate a short-lived JWT for the DocuSeal Builder component.
 *
 * @param userEmail - The authenticated user's email (for attribution)
 * @param options - Additional token payload options
 * @param ttlSeconds - Token TTL in seconds (default: 15 minutes)
 * @returns Signed JWT string
 */
export function generateBuilderToken(
  userEmail: string,
  options: {
    externalId?: string;
    folderName?: string;
    templateName?: string;
  } = {},
  ttlSeconds = 900,
): string {
  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!apiKey) {
    throw new Error('Missing DOCUSEAL_API_KEY environment variable');
  }

  const now = Math.floor(Date.now() / 1000);

  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };

  const payload: BuilderTokenPayload & { iat: number; exp: number } = {
    user_email: userEmail,
    integration_email: process.env.DOCUSEAL_USER_EMAIL || userEmail,
    iat: now,
    exp: now + ttlSeconds,
    ...(options.externalId && { external_id: options.externalId }),
    ...(options.folderName && { folder_name: options.folderName }),
    ...(options.templateName && { name: options.templateName }),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmacSignature(`${encodedHeader}.${encodedPayload}`, apiKey);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
