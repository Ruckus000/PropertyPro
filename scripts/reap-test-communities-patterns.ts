/**
 * Pure slug-classification logic for the test-community reaper.
 *
 * Kept dependency-free (no DB imports) so it can be unit-tested hermetically and
 * so the SQL candidate filter and the JS predicate share ONE source of truth.
 */

/**
 * POSIX regexes (Postgres `~`) identifying integration-test community slugs.
 *
 * Each pattern is ANCHORED to a known test slug base — a bare `-[0-9a-f]{8}$`
 * suffix match was deliberately avoided because real, user-chosen community
 * slugs could end in 8 hex chars and must never be reaped from production.
 *
 * Add a new entry whenever a test/script introduces a new leak-prone slug shape
 * (e.g. a new `seedCommunities` fixture slug base).
 */
export const TEST_COMMUNITY_SLUG_PATTERNS: readonly string[] = [
  '^p2-43-.*-[0-9a-f]{8}$', // kit fixtures (`p2-43-<name>-<8hex runSuffix>`)
  '^advisory-.*-[0-9a-f]{8}$', // signup-subdomain direct inserts (`advisory-taken-<8hex>`)
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
