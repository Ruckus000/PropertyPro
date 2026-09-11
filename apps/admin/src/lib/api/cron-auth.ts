/**
 * Bearer-token authentication for the console's scheduled-job routes — the
 * apps/admin counterpart of `apps/web/src/lib/api/cron-auth.ts`.
 *
 * ## Why this is a copy rather than an import
 *
 * Web's helper is not importable from here. It lives at
 * `apps/web/src/lib/api/cron-auth.ts`, behind web's own `@/` alias, in a
 * separate Next app with its own tsconfig paths and its own build — admin
 * cannot resolve it, and reaching across with a relative `../../../../web/...`
 * path would pull a second app's module graph into this one's bundle. The one
 * genuinely shared piece, `UnauthorizedError`, IS imported from
 * `@propertypro/shared/http`, which is what makes `withAdminErrorHandler` turn
 * a throw here into a 401 envelope rather than a 500.
 *
 * The behaviour is deliberately identical, including the name, because
 * `pnpm guard:internal-cron-auth` greps for `requireCronSecret(` under BOTH
 * internal roots. Renaming it here would make the guard's check on this app
 * vacuous while it kept passing.
 *
 * ## Fail closed, in constant time
 *
 * - No `Authorization` header, or one that is not `Bearer …` → refused.
 * - No secret configured at all → refused. An unset `CRON_SECRET` must not mean
 *   "let everyone in"; on this app that would be an unauthenticated POST on the
 *   deployment that holds the service-role key.
 * - Comparison is `timingSafeEqual` over equal-length buffers, never `===`.
 *   Lengths are compared first because `timingSafeEqual` THROWS on a length
 *   mismatch rather than returning false.
 *
 * The candidate list is variadic for the same reason web's is: Vercel Cron
 * authenticates every job with the platform-wide `CRON_SECRET`, and a route may
 * also want to accept a dedicated secret. Undefined and empty candidates are
 * dropped, so passing `process.env.X` for an unset `X` is safe.
 */
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';

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
 * Validate that the request carries a Bearer token matching at least one of the
 * accepted secrets.
 *
 * @param acceptedSecrets - Candidate secrets, most specific first. Undefined or
 *   empty entries are ignored; if none survive, the request is refused.
 * @throws UnauthorizedError if the token is missing, or matches no candidate.
 */
export function requireCronSecret(
  req: NextRequest,
  ...acceptedSecrets: Array<string | undefined>
): void {
  const token = readBearerToken(req);
  const candidates = acceptedSecrets.filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );

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
