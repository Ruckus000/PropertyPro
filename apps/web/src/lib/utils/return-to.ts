/**
 * Helpers for the `?returnTo=…` round-trip used by the missing-tenant redirect
 * flow (middleware → /select-community → picked-community-with-original-path).
 *
 * The path can carry a query string but must not be an open-redirect target,
 * a protocol-relative URL, or an external host. Anything that doesn't pass
 * the guard is dropped — callers fall back to `/dashboard`.
 */

const RETURN_TO_PARAM = 'returnTo';

/** Reject open-redirect / off-site / scheme-bearing targets. */
export function resolveSafeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  // Defensive: a backslash after the slash can be parsed by some browsers as
  // a host separator (`/\\evil.com`).
  if (value.startsWith('/\\')) return null;
  return value;
}

/**
 * Inject `?communityId=<id>` into a returnTo path while preserving any other
 * query/hash and stripping a stale or attacker-supplied communityId param.
 * Falls back to `/dashboard?communityId=<id>` on parse failures.
 */
export function applyCommunityIdToReturnTo(returnTo: string, communityId: number): string {
  try {
    // URL needs an origin to parse a relative path — use a sentinel and strip it.
    const url = new URL(returnTo, 'http://internal');
    url.searchParams.delete('communityId');
    url.searchParams.delete(RETURN_TO_PARAM);
    url.searchParams.set('communityId', String(communityId));
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return `/dashboard?communityId=${communityId}`;
  }
}
