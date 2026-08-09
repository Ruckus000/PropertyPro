/**
 * Shared cron authentication helper.
 *
 * Validates a Bearer token from the scheduler using timing-safe comparison.
 *
 * ## Why this accepts MORE THAN ONE secret
 *
 * Vercel Cron authenticates every scheduled job with a single, platform-wide
 * `Authorization: Bearer $CRON_SECRET`. Each route here historically validated
 * its own dedicated secret name (`PAYMENT_REMINDERS_CRON_SECRET`,
 * `ASSESSMENT_CRON_SECRET`, …). Those two facts cannot both hold: whatever
 * `CRON_SECRET` is, it will not equal a per-route secret, so the route 401s.
 *
 * A `X ?? CRON_SECRET` fallback does NOT fix this. `??` only reaches the
 * fallback when the per-route secret is *unset* — and the routes that were
 * configured (payment reminders, assessments, compliance, …) all had theirs
 * set, so they would keep rejecting the platform's token. The fallback would
 * have quietly fixed only the routes nobody had configured.
 *
 * So: accept ANY of the candidate secrets. The route stays reachable by its
 * dedicated secret (manual invocation, a bespoke scheduler) *and* by the
 * platform cron secret. Undefined/empty candidates are ignored, and if every
 * candidate is missing the request is refused — it still fails closed.
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

/** Constant-time equality. Length is compared first because timingSafeEqual throws on a mismatch. */
function secretMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Validates that the request carries a Bearer token matching at least one of
 * the accepted secrets. Uses constant-time comparison to prevent timing attacks.
 *
 * @param acceptedSecrets - Candidate secrets, most specific first. Pass the
 *   route's dedicated secret and `process.env.CRON_SECRET`; undefined entries
 *   are ignored.
 * @throws UnauthorizedError if the token is missing, or matches no candidate
 */
export function requireCronSecret(
  req: NextRequest,
  ...acceptedSecrets: Array<string | undefined>
): void {
  const token = readBearerToken(req);
  const candidates = acceptedSecrets.filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );

  // Fail closed: no token, or no secret configured at all.
  if (!token || candidates.length === 0) {
    throw new UnauthorizedError();
  }

  // Deliberately does NOT short-circuit: every candidate is compared so the
  // work done is independent of which one matches.
  let matched = false;
  for (const candidate of candidates) {
    if (secretMatches(candidate, token)) matched = true;
  }

  if (!matched) {
    throw new UnauthorizedError();
  }
}
