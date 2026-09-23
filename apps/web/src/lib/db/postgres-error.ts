/**
 * Shared Postgres error predicates.
 *
 * This module exists because the repo had seven hand-written copies of
 * "is this a unique violation?" in **three mutually incompatible semantics**
 * (audit SVC-06). Copies were previously being collapsed on sight, which is
 * unsafe: the families disagree about whether a *wrapped* error counts, and
 * that single axis decides whether a request gets a 409 or a 500.
 *
 * ## Family 1 — `hasPostgresErrorCode` / `isUniqueConstraintError`: WALKS `cause`
 *
 * The driver wraps the original error, so a top-level `code` check alone
 * misses the shape it actually throws. Used by the reservation, poll-ballot
 * and site-publish paths, all of which *swallow* a 23505 as a duplicate.
 *
 * ## Family 2 — `isTopLevelUniqueConstraintError`: reads `code` ONLY
 *
 * Deliberately **not** merged with family 1, even though family 1 is the
 * strictly more capable predicate. Folding the two would change behaviour at
 * the highest-stakes call site in the set: `elections-service.ts` catches a
 * top-level 23505 and turns it into the statutory "this unit has already
 * submitted a ballot" 409, but a *wrapped* 23505 falls through to `throw
 * error` (a 500) at both `:1007` and `:1263`. Post-collapse, a wrapped error
 * would be reported to a voter as a duplicate ballot — a wrong-but-200-class
 * failure on the §718.128 path, with every existing test still green because
 * no test feeds that shape today. Widening the family-2 predicate is a policy
 * decision with an elections consequence attached, not a dedup.
 *
 * ## Not here on purpose
 *
 * - `lib/db/unique-constraint-error.ts` requires code 23505 **and** a matching
 *   constraint NAME. It is strictly narrower than either predicate above and
 *   answers a different question ("did THIS index reject the write"), so it
 *   stays its own module and these call sites do not route through it.
 * - `notification-digest-queue.ts` keeps its own variant (an `instanceof Error`
 *   gate plus a `/unique/i` message regex). Collapsing it would flip
 *   `enqueueDigestItem` from throwing to silently reporting `{ enqueued: false }`
 *   for message-only failures — a dropped digest nobody sees.
 *
 * @see docs/audits/2026-09-22-refactor-audit-and-cleanup-roadmap.md (SVC-06)
 */

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * True when `error`, or anything it wraps via `cause`, carries `expectedCode`.
 *
 * Lifted verbatim from the three byte-identical copies in
 * `work-orders-service`, `polls-service` and `site-publish-schedule-service`.
 */
export function hasPostgresErrorCode(error: unknown, expectedCode: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if ('code' in error && (error as { code: unknown }).code === expectedCode) {
    return true;
  }

  if ('cause' in error) {
    return hasPostgresErrorCode((error as { cause: unknown }).cause, expectedCode);
  }

  return false;
}

/**
 * 23505 anywhere in the chain, including under `cause`. Family 1 — see the
 * file header before using this where family 2 is called for.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return hasPostgresErrorCode(error, UNIQUE_VIOLATION);
}

/**
 * 23505 on the error itself, with no `cause` walk. Family 2 — see the file
 * header for why the absence of a walk is load-bearing.
 */
export function isTopLevelUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}
