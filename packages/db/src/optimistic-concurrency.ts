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
 * ── Why only the comparison lives here ──
 *
 * The invariant is PER TABLE, not per call site: for a table whose `updated_at`
 * is a token, EVERY write must advance it, not only the writes that also check
 * it. Enforcing that in TypeScript was tried twice and leaked twice — first at
 * the three services that compare the token (but `user_roles` has eleven
 * writers and only one compares it), then at every write through
 * `createScopedClient` (but the admin console writes `user_roles` with the
 * supabase-js service-role client, and a lease trigger writes `units`, neither
 * of which goes through it).
 *
 * So the ADVANCE is a database trigger — `pp_advance_updated_at`, migration
 * 0087 — which no choice of client can bypass, and this module keeps only the
 * COMPARISON. Read that migration for the expression and why it is shaped the
 * way it is.
 *
 * Two things fall out of computing the timestamp in SQL rather than in JS: the
 * value now comes from the DATABASE clock, so skew between app instances no
 * longer perturbs the token, and post-update values are exactly millisecond
 * precision, making the JSON round-trip lossless rather than merely tolerated.
 *
 * Known limits. A row updated more than ~1000 times per second drifts ahead of
 * wall clock by 1 ms per update, because each one must out-rank the last; the
 * versioned tables are human-edited (units, memberships, household members), so
 * a bounded, visible drift beats a silent lost update. And `now()` is
 * transaction-stable, so a write late in a long transaction records the
 * transaction's start — consistent for a version token, and it matches
 * `.defaultNow()` on INSERT.
 *
 * What this does NOT reach: a writer that bypasses the scoped client.
 * `leases_sync_unit_rent_amount` updates `units.rent_amount` from a lease edit
 * in a database trigger, so a rent change is invisible to the unit token. Only
 * a trigger maintaining `updated_at` would close that, and no table here has
 * one.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * "Has anyone saved since I read this?" — added to the UPDATE's WHERE.
 *
 * Returns `undefined` when the caller sent no token, which stays
 * last-write-wins, as it always has, for callers that never read the row first.
 */
export function unchangedSince(
  column: PgColumn | SQL,
  expectedUpdatedAt: string | undefined,
): SQL | undefined {
  if (expectedUpdatedAt === undefined) return undefined;
  return sql`date_trunc('milliseconds', ${column}) = date_trunc('milliseconds', ${expectedUpdatedAt}::timestamptz)`;
}
