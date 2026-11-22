import { isSafeReturnPath } from './return-to';

/**
 * Resolves the `returnTo` query parameter to a safe internal path.
 *
 * Prevents open redirect attacks by requiring the value to start with `/`
 * but not `//` (which would be treated as a protocol-relative URL).
 *
 * Default when no valid returnTo is provided:
 *  - With tenant context (subdomain login): `/dashboard` (skip community picker)
 *  - Without tenant context (root domain login): `/select-community`
 *
 * The optional second parameter is backwards-compatible — existing callers
 * without it get the current default (`/select-community`).
 */
export function resolveReturnTo(
  value: string | string[] | undefined,
  hasTenantContext: boolean = false,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  // Accept only a path beginning with a single '/' NOT followed by '/' or '\',
  // with no control characters, that is STILL such a path once the URL parser
  // has normalised it. The WHATWG URL parser (Next's router / <a> resolution)
  // treats both '//evil.com' and '/\evil.com' as protocol-relative, and it
  // collapses '/.//evil.com' (dot segments, '%2e', backslashes, stripped tabs)
  // into the path '//evil.com' — which Next's router re-serialises as
  // pathname + search, i.e. protocol-relative. `isSafeReturnPath` checks both.
  if (raw && isSafeReturnPath(raw)) return raw;
  return hasTenantContext ? '/dashboard' : '/select-community';
}
