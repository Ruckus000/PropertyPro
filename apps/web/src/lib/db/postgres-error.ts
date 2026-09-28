/**
 * Shared Postgres error predicates.
 *
 * ## The one fact every caller needs
 *
 * drizzle-orm (0.45.x) wraps EVERY failed query: `pg-core/session.js`
 * `queryWithCache` does `throw new DrizzleQueryError(query, params, e)`. So a
 * unique violation reaches application code as a `DrizzleQueryError` with NO
 * top-level `code`; Postgres's `code: '23505'` and `constraint_name` are on
 * `.cause`. A predicate that reads only the top-level `code` never matches on a
 * drizzle path — it is dead code that turns every intended 409 / "duplicate,
 * skip" branch into a 500. Pinned against a real database by
 * `__tests__/integration/postgres-error-shape.integration.test.ts`.
 *
 * (Phase 1's SVC-06 pass got this backwards: it kept a top-level-only
 * `isTopLevelUniqueConstraintError` on the premise that a wrapped error means
 * "the driver failed the query, not the constraint". It is the reverse — the
 * wrapped form is exactly what a constraint rejection looks like — so that
 * predicate is gone and its callers were re-audited one by one.)
 *
 * ## Which predicate
 *
 * - `isNamedUniqueViolation(error, name)` — prefer this wherever the caller
 *   turns a duplicate into a user-facing answer (a 409, "already submitted").
 *   It answers "did THIS index reject the write", so an unrelated unique index
 *   touched in the same try block cannot be misreported as the duplicate.
 * - `isUniqueConstraintError(error)` — any 23505 in the chain. For idempotent
 *   inserts whose try block touches exactly one unique index.
 *
 * ## Not here on purpose
 *
 * - `notification-digest-queue.ts` keeps its own variant (it also treats a
 *   `/unique/i` message as a duplicate); see the note there.
 * - `finance-service.ts` `recordFinanceStripeEvent` deliberately does NOT treat
 *   a fenced event as "already processed" — see `FinanceWebhookFenceConflict`.
 *
 * @see docs/audits/2026-09-22-refactor-audit-and-cleanup-roadmap.md (SVC-06)
 */

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * Bound on the `cause` walk. drizzle adds exactly one level; the bound only
 * guards against a cyclic `cause` chain.
 */
const MAX_CAUSE_DEPTH = 8;

/** `error` followed by each `cause` it wraps, outermost first. */
function* causeChain(error: unknown): Generator<Record<string, unknown>> {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return;
    const record = current as Record<string, unknown>;
    yield record;
    if (!('cause' in record)) return;
    current = record.cause;
  }
}

/** True when `error`, or anything it wraps via `cause`, carries `expectedCode`. */
export function hasPostgresErrorCode(error: unknown, expectedCode: string): boolean {
  for (const link of causeChain(error)) {
    if (link.code === expectedCode) return true;
  }
  return false;
}

/** 23505 anywhere in the chain, including under `cause`. */
export function isUniqueConstraintError(error: unknown): boolean {
  return hasPostgresErrorCode(error, UNIQUE_VIOLATION);
}

/**
 * 23505 raised by the constraint named `constraintName`, anywhere in the chain.
 * Both `constraint_name` (postgres-js) and `constraint` (node-postgres) are
 * read, because drivers disagree on which they populate.
 */
export function isNamedUniqueViolation(error: unknown, constraintName: string): boolean {
  for (const link of causeChain(error)) {
    if (
      link.code === UNIQUE_VIOLATION &&
      (link.constraint_name === constraintName || link.constraint === constraintName)
    ) {
      return true;
    }
  }
  return false;
}
