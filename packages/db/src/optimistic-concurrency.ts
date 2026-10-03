/**
 * Optimistic concurrency for row edits: "has anyone saved since I read this?"
 *
 * The token is the row's `updated_at` as the caller last read it, round-tripped
 * through JSON (`z.string().datetime({ offset: true })` in the route contracts).
 * JSON carries MILLISECONDS, so the comparison truncates both sides to
 * milliseconds — that part was always correct.
 *
 * ── The window this closes ──
 *
 * The comparison was never the bug. The WRITE was: it could fail to advance the
 * value being compared.
 *
 *   - INSERT leaves `updated_at` to `.defaultNow()` — Postgres `now()`, with
 *     MICROSECONDS (e.g. 12:00:00.123456).
 *   - UPDATE went through `scoped-client`, which stamped a JavaScript
 *     `new Date()` — MILLISECONDS (12:00:00.123000).
 *
 * So a create at .123456 and the first save inside that same millisecond both
 * truncate to .123. The stored token did not move, the stale token still
 * matched, and the SECOND save from the same read was silently accepted —
 * clobbering the first writer. A missed conflict, which is the dangerous
 * direction; a false conflict would merely have been annoying.
 *
 * It needed the first save to land in the same millisecond as whatever last
 * wrote the row, so a human editing a row read minutes ago was never affected.
 * A create-then-save, or a double-submitted save, was. An integration test
 * doing exactly that is what caught it, intermittently, in CI.
 *
 * ── Why `greatest(now(), updated_at + 1ms)` does NOT fix it ──
 *
 * Worth recording, because it looks right: `now()` carries microseconds, so it
 * can land inside the same millisecond as the stored value and leave the
 * TRUNCATED value unchanged. The advance has to happen on the truncated value
 * itself, which is what `advance` below does.
 *
 * ── Why both halves come from one call ──
 *
 * `fence()` returns the comparison AND the new timestamp together so a caller
 * cannot take one without the other. Three services share this token; a fourth
 * adopting the comparison and forgetting the advance would silently reopen the
 * window, and that is exactly the failure this module exists to make
 * impossible. It is structural, which is cheaper and more reliable than a
 * repo guard that has to remember to look.
 *
 * Two things fall out of computing the timestamp in SQL rather than in JS: the
 * value now comes from the DATABASE clock, so skew between app instances no
 * longer perturbs the token, and post-update values are exactly millisecond
 * precision, making the JSON round-trip lossless rather than merely tolerated.
 *
 * Known limit: a row updated more than ~1000 times per second drifts ahead of
 * wall clock by 1 ms per update, because each one must out-rank the last. These
 * are human-edited rows (units, memberships, household members). A bounded,
 * visible drift is a better trade than a silent lost update.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

export interface OptimisticFence {
  /**
   * Added to the UPDATE's WHERE, or `undefined` when the caller sent no token —
   * which stays last-write-wins, as it always has, for callers that never read
   * the row first.
   */
  where: SQL | undefined;
  /**
   * Always present, token or not. Monotonicity is what makes a LATER read's
   * token trustworthy, so it must hold even for writes nobody fenced.
   *
   * Pass it as `updatedAt` in the values object, LAST in the spread so it wins
   * over anything a caller supplied.
   */
  updatedAt: SQL;
}

/**
 * Build the compare-and-advance pair for one row's `updated_at` column.
 *
 * `column` must be the same column on both sides — the one the caller read its
 * token from and the one being written.
 *
 * It accepts a raw `SQL` fragment as well as a column so the advance can be
 * evaluated against an arbitrary expression. That is what lets a test force the
 * same-millisecond collision: it cannot be reproduced from outside the database
 * (every round trip moves the clock on), but `now()` is TRANSACTION-stable, so
 * pinning a value and applying this expression to it inside one statement
 * reproduces it exactly. Production always passes a column.
 */
export function fence(
  column: PgColumn | SQL,
  expectedUpdatedAt: string | undefined,
): OptimisticFence {
  return {
    where:
      expectedUpdatedAt === undefined
        ? undefined
        : sql`date_trunc('milliseconds', ${column}) = date_trunc('milliseconds', ${expectedUpdatedAt}::timestamptz)`,
    // `greatest` is what guarantees strict advancement: normally the clock has
    // already moved past the stored millisecond and the first term wins; in the
    // collision case the two are equal, so the second term — one millisecond
    // past the stored value — wins instead. Either way the truncated value
    // strictly increases, so a stale token can never match after a write.
    updatedAt: sql`greatest(date_trunc('milliseconds', now()), date_trunc('milliseconds', ${column}) + interval '1 millisecond')`,
  };
}
