import type { NextRequest } from 'next/server';

/**
 * Best-effort client IP for rate-limit keying and consent/audit IP evidence on
 * unauthenticated routes.
 *
 * Prefers `x-real-ip`: on Vercel the platform sets it to the true client IP and
 * a client cannot forge it, whereas `x-forwarded-for`'s FIRST entry is
 * client-supplied (Vercel appends the real IP after any client value). Only
 * fall back to the XFF head when `x-real-ip` is absent. Still best-effort —
 * never use for authorization — but this keeps a persisted consent IP from
 * being trivially spoofable by the consenting party.
 */
export function resolveClientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first || 'unknown';
}
