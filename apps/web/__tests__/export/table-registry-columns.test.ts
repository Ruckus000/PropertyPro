/**
 * Every column reference in the export registry must RESOLVE.
 *
 * ── Why this is its own file ──
 *
 * `table-registry-coverage.test.ts` cannot make this assertion. It stubs every
 * drizzle table with a Proxy that returns a marker for ANY property, so
 * `userRoles.deletedAt` is defined there whether or not the column exists. Its
 * own comment warns that a bare-Symbol mock makes every reference silently
 * `undefined` — "which is how a mock stops resembling the thing it mocks" — and
 * the Proxy is that same failure inverted: every reference is silently DEFINED.
 * Adding this check there passes unconditionally. It was tried; it did.
 *
 * So this file imports the REAL tables and mocks nothing.
 *
 * ── The bug it exists to prevent ──
 *
 * `auditColumns()` referenced `table.deletedAt` unconditionally. `user_roles`
 * and `meeting_documents` have no such column, so `col()` received `undefined`,
 * the projection carried an undefined value, and the read threw
 * "Cannot convert undefined or null to object". The worker catches per-table on
 * purpose — one unreadable table must not cost an association its other twenty
 * — so the job still completed as `ready` with the failure buried in
 * `manifest.warnings`. From outside it looked like a clean export.
 *
 * `user_roles` is the one that mattered: "who held which role, and any board
 * designation", the record a §718.111(12) dispute turns on. It had never
 * appeared in an archive.
 *
 * Broader than that bug on purpose — it also catches a typo in an explicit call
 * such as `col('userId', 'User ID', userRoles.usreId)`, which fails the same
 * silent way.
 */
import { describe, expect, it } from 'vitest';

// The registry's barrel reaches drizzle.ts, which THROWS at module load when
// DATABASE_URL is unset. Nothing here connects — the client is only
// constructed — but the variable has to exist. localci sets it for every vitest
// step; this default keeps a bare `pnpm test` working too.
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/propertypro_stub';

const { EXPORT_TABLES } = await import('@/lib/services/export/table-registry');

describe('export table registry — column references', () => {
  it('resolves every column on every table', () => {
    const unresolved: string[] = [];
    for (const spec of EXPORT_TABLES) {
      for (const column of spec.columns) {
        if (column.column === undefined || column.column === null) {
          unresolved.push(`${spec.tableName}.${column.key}`);
        }
      }
    }

    // Every offender at once: failing on the first would hide the rest, and
    // this bug came in pairs.
    expect(unresolved, 'column references that resolve to undefined').toEqual([]);
  });

  it('examined a non-empty registry, so the check above cannot pass vacuously', () => {
    // A registry that failed to import satisfies an empty for-loop perfectly.
    expect(EXPORT_TABLES.length).toBeGreaterThan(20);
    const columnCount = EXPORT_TABLES.reduce((n, s) => n + s.columns.length, 0);
    expect(columnCount).toBeGreaterThan(100);
  });
});
