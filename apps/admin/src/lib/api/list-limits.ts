/**
 * Row caps for admin list endpoints.
 *
 * ## Why a cap and not cursor pagination
 *
 * Fifteen admin GET handlers returned whole tables with no `limit`. The console
 * is a single-operator tool with no paging UI, and every one of these lists is
 * scoped to something naturally small (one community's members, one community's
 * access plans, the starter packs for one community type). A cursor contract
 * across all of them would be a large change for a case the UI cannot express.
 *
 * A hard cap fixes the actual risk — one request materialising an unbounded
 * result set — without inventing an API the client does not consume. The number
 * is set well above any plausible real value, so hitting it means something is
 * wrong, and `wasTruncated` lets the caller say so rather than quietly showing
 * a short list.
 *
 * If a surface genuinely outgrows its cap, that is the signal to give *that*
 * endpoint a real cursor, not to raise the number.
 */

/** Per-community lists: members, access plans, deletion requests. */
export const COMMUNITY_LIST_LIMIT = 1000;

/** Platform-wide lists: demos, starter packs, layouts, theme presets, rootless report. */
export const PLATFORM_LIST_LIMIT = 500;

/**
 * True when a result came back exactly at its cap, i.e. there may be more rows
 * that were not returned.
 *
 * Deliberately `>=` rather than `===`: a caller that post-filters could arrive
 * with fewer rows than the cap it requested, and reporting "complete" in that
 * case would be a lie in the one direction that matters.
 */
export function wasTruncated(rowCount: number, limit: number): boolean {
  return rowCount >= limit;
}

/**
 * Paging for unbounded aggregate scans.
 *
 * Lives here, next to the other list limits, rather than beside its first
 * caller: it is pure logic, and its previous home (`lib/server/clients.ts`)
 * imports `@propertypro/db/unsafe`, which loads drizzle EAGERLY at module
 * scope. Importing a pure helper from there dragged that in transitively and
 * made `dashboard-series.ts`'s tests fail on a missing `DATABASE_URL` with an
 * error naming drizzle rather than the import that caused it — a trap this
 * repo has paid for before. The `db` parameter is a TYPE-only import, which is
 * erased, so nothing here loads at runtime.
 */
import type { createAdminClient } from '@propertypro/db/supabase/admin';

/**
 * Page size for `fetchRowsInPages` scans over `user_roles`. Exported so
 * `dashboard-series.ts`'s members read shares the same page/bound as
 * `fetchMemberCounts` rather than picking its own numbers.
 */
export const MEMBER_COUNT_PAGE_SIZE = 1000;

/**
 * Safety valve for `fetchRowsInPages` scans over `user_roles`. `user_roles`
 * holds one row per member per community, so this bounds member ROWS across
 * every community on the platform in a single call — not the number of
 * communities, and not any one community's membership. Sized well above any
 * plausible real platform total; hitting it means the platform has genuinely
 * outgrown counting this way, not that an ordinary day had more members than
 * expected.
 */
export const MEMBER_COUNT_ROW_BOUND = 20 * MEMBER_COUNT_PAGE_SIZE;

export interface PagedRowsResult<T> {
  rows: T[];
  /**
   * `false` means the scan hit `rowBound` before exhausting the table for
   * these ids — with no `ORDER BY`, every row in `rows` is then unproven
   * (whichever rows landed after the cutoff are simply missing, and there's
   * no way to tell which ones), not just the ones past the cutoff.
   */
  exact: boolean;
}

/**
 * Pages `table.select(columns).in(inColumn, ids).range()` until a page comes
 * back short (the table is exhausted for these ids — exact) or `rowBound`
 * rows have been read (give up on exactness rather than silently
 * under-reporting). No `ORDER BY` is applied, so this is only safe to use
 * when the caller doesn't need a stable row order — an unbounded aggregate
 * scan, not a UI page.
 *
 * Extracted from `fetchMemberCounts` (below) so `getDashboardSeries`'s
 * members read (`dashboard-series.ts`) shares this truncation-safe scan
 * instead of hand-rolling a fourth paging loop — `clients.ts` already has two
 * (this one and `fetchAllComplianceRows`), and `dashboard.ts:128` a third.
 */
export async function fetchRowsInPages<T>(
  db: ReturnType<typeof createAdminClient>,
  table: string,
  columns: string,
  inColumn: string,
  ids: number[],
  pageSize: number,
  rowBound: number,
): Promise<PagedRowsResult<T>> {
  const rows: T[] = [];
  if (ids.length === 0) return { rows, exact: true };

  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .in(inColumn, ids)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load ${table} (offset ${from}): ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (!wasTruncated(page.length, pageSize)) {
      // Last page came back short of a full page: every matching row has
      // been seen, so the accumulated rows are exact.
      return { rows, exact: true };
    }

    if (rows.length >= rowBound) {
      return { rows, exact: false };
    }

    from += pageSize;
  }
}
