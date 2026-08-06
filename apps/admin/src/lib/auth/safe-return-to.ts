/**
 * Only same-origin, path-relative destinations survive the post-login redirect.
 *
 * ## The two traps, in order
 *
 * The original guard was three prefix rules (`startsWith('/')`,
 * `!startsWith('//')`). It rejected `//evil.com` but not `/\evil.com` —
 * browsers normalise backslashes in the authority position, so that IS a
 * protocol-relative URL and the operator lands on an attacker's host having
 * just typed platform-admin credentials into the genuine login page.
 *
 * Resolving against the real origin fixes that. But resolving alone is NOT
 * enough, and getting this wrong made things **worse than the prefix rules**:
 *
 *     new URL('/.//evil.com', origin).pathname === '//evil.com'
 *
 * Dot-segment normalisation moves `//` from the middle of the path to the
 * FRONT of it. Checking `resolved.origin` passes — the input really did
 * resolve to this origin — and then the returned string is protocol-relative,
 * and `router.push` re-resolves it against `location.href`, where a leading
 * `//` is an authority. `/..//evil.com`, `/a/..//evil.com`, `/./\evil.com`,
 * `/%2e//evil.com` and `/.///evil.com` all do the same thing. The old code
 * returned `/.//evil.com` verbatim, which stays on-origin — so the "safer"
 * rewrite manufactured the redirect it was written to prevent.
 *
 * Hence: validate the OUTPUT, not just the input. Normalisation happens
 * between the two, so a check on either one alone is not a check on what the
 * caller actually navigates to.
 */
export function safeReturnTo(value: string | null): string {
  const fallback = '/clients';
  if (!value || !value.startsWith('/')) return fallback;

  // During SSR of this client component there is no `window`; the throw lands
  // in the catch and yields the fallback. Harmless — `returnTo` is only read
  // inside the submit handler, never rendered, so there is no hydration
  // mismatch and the resolved value is correct by the time it is used.
  try {
    const origin = window.location.origin;
    const resolved = new URL(value, origin);
    if (resolved.origin !== origin) return fallback;

    const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;

    // The load-bearing line. `path` is what the caller hands to `router.push`,
    // so it — not `value` — is what has to be a plain rooted path.
    if (!path.startsWith('/') || path.startsWith('//')) return fallback;

    return path;
  } catch {
    return fallback;
  }
}
