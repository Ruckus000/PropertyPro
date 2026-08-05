import type { NextRequest } from 'next/server';

/**
 * Best-effort client IP for rate-limit keying on unauthenticated routes.
 *
 * Trusts `x-forwarded-for`'s first entry, which is correct behind Vercel's
 * proxy and spoofable anywhere it is not. That is acceptable for throttling —
 * it must never be used for authorization.
 */
export function resolveClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}
