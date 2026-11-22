/**
 * Helpers for the `?returnTo=…` round-trip used by the missing-tenant redirect
 * flow (middleware → /select-community → picked-community-with-original-path).
 *
 * The path can carry a query string but must not be an open-redirect target,
 * a protocol-relative URL, or an external host. Anything that doesn't pass
 * the guard is dropped — callers fall back to `/dashboard`.
 *
 * Screening the raw string is not enough. The URL parser removes dot segments
 * (`/.`, `/..`, `/%2e`), turns `\` into `/` and strips tabs and newlines, so a
 * value like `/.//evil.com` starts with one slash but NORMALISES to the path
 * `//evil.com`. Anything that then serialises only `pathname + search + hash`
 * (as `applyCommunityIdToReturnTo` does, and as Next's router does) emits a
 * protocol-relative URL — an off-site redirect. Every check below therefore
 * also parses the value and inspects what the parser made of it.
 */

const RETURN_TO_PARAM = 'returnTo';

/** Origin used only to parse a relative path; never emitted. */
const SENTINEL_ORIGIN = 'http://internal';

/**
 * True when a parsed URL is still on the sentinel origin AND its normalised
 * pathname is not protocol-relative. `new URL` maps `\` to `/` for http, so a
 * leading `//` covers both `//host` and `/\host`; the backslash is kept in the
 * pattern for clarity.
 */
function staysOnSite(url: URL): boolean {
  return url.origin === SENTINEL_ORIGIN && !/^\/[/\\]/.test(url.pathname);
}

/**
 * True when `value` is a same-site path that stays same-site after URL
 * normalisation: a raw-string screen (one leading `/` not followed by `/` or
 * `\`, no control characters) plus the parse-and-compare step.
 *
 * The ONE screen for every returnTo/redirect reader in apps/web: the
 * middleware, the login and verify-email pages, /select-community and the
 * demo-login `?redirect=` override all call it. It must stay import-free and
 * runtime-neutral (`URL` and RegExp only) because the middleware imports it
 * into the edge bundle.
 */
export function isSafeReturnPath(value: string): boolean {
  if (!/^\/(?![/\\])/.test(value)) return false;
  if (/[\u0000-\u001f]/.test(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value, SENTINEL_ORIGIN);
  } catch {
    return false;
  }
  return staysOnSite(parsed);
}

/** Reject open-redirect / off-site / scheme-bearing targets. */
export function resolveSafeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  return isSafeReturnPath(value) ? value : null;
}

/**
 * Inject `?communityId=<id>` into a returnTo path while preserving any other
 * query/hash and stripping a stale or attacker-supplied communityId param.
 * Falls back to `/dashboard?communityId=<id>` on parse failures, and whenever
 * the input would leave the site — the result never begins with `//` or `/\`.
 */
export function applyCommunityIdToReturnTo(returnTo: string, communityId: number): string {
  const fallback = `/dashboard?communityId=${communityId}`;
  try {
    // URL needs an origin to parse a relative path — use a sentinel and strip it.
    const url = new URL(returnTo, SENTINEL_ORIGIN);
    if (!staysOnSite(url)) return fallback;
    url.searchParams.delete('communityId');
    url.searchParams.delete(RETURN_TO_PARAM);
    url.searchParams.set('communityId', String(communityId));
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
