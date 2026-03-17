/**
 * Shared cron authentication helper.
 *
 * Validates Bearer token from Vercel Cron using timing-safe comparison
 * to prevent timing side-channel attacks.
 */
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { UnauthorizedError } from '@/lib/api/errors/UnauthorizedError';

function readBearerToken(req: NextRequest): string | null {
  const raw = req.headers.get('authorization');
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith('bearer ')) return null;
  return raw.slice('bearer '.length).trim();
}

/**
 * Validates that the request carries a valid Bearer token matching the
 * expected secret. Uses constant-time comparison to prevent timing attacks.
 *
 * @throws UnauthorizedError if the token is missing or invalid
 */
export function requireCronSecret(req: NextRequest, expectedSecret: string | undefined): void {
  const token = readBearerToken(req);

  if (!expectedSecret || !token) {
    throw new UnauthorizedError();
  }

  // Constant-time comparison requires equal-length buffers
  const expected = Buffer.from(expectedSecret);
  const actual = Buffer.from(token);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new UnauthorizedError();
  }
}
