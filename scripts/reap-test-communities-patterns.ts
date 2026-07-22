/**
 * Pure slug-classification logic for the test-community reaper.
 *
 * Kept dependency-free (no DB imports) so it can be unit-tested hermetically and
 * so the SQL candidate filter and the JS predicate share ONE source of truth.
 */

/**
 * POSIX regexes (Postgres `~`) identifying integration-test community slugs.
 *
 * Add a new entry whenever a test/script introduces a new leak-prone slug shape.
 */
export const TEST_COMMUNITY_SLUG_PATTERNS: readonly string[] = [
  '-[0-9a-f]{8}$', // kit run-suffix (`p2-43-*-<8hex>`) and advisory-* (`advisory-taken-<8hex>`)
  '^p4_55_rls_', // RLS multi-community fixtures (`p4_55_rls_<ts>_<hex>-a/-b`)
  '^reconcile-test-', // ledger reconcile fixtures
  '^t-bootstrap-', // stripe bootstrap fixtures (`t-bootstrap-multi-1/2`)
];

/** Real communities that must never be reaped, regardless of pattern/age. */
export const PROTECTED_COMMUNITY_IDS: readonly number[] = [1, 2, 3];

/** Legitimate demo seed rows (`demo-*`) are never test leaks. */
export const DEMO_SLUG_PREFIX = /^demo-/;

/**
 * Pure predicate mirroring the SQL candidate filter (pattern match + demo
 * exclusion). Exported for unit testing so a pattern edit that would match real
 * data fails CI. NOTE: the age/id guards are enforced in SQL, not here.
 */
export function matchesTestCommunitySlug(slug: string): boolean {
  if (DEMO_SLUG_PREFIX.test(slug)) return false;
  return TEST_COMMUNITY_SLUG_PATTERNS.some((pattern) => new RegExp(pattern).test(slug));
}
