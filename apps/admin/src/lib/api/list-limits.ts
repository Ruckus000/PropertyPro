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
 * Page size for `fetchAllRowsInPages` scans over `communities`.
 *
 * 1000 is PostgREST's `db-max-rows` on Supabase, which is the number that made
 * this necessary: an unpaged `.select()` with filters and no `.range()` is
 * TRUNCATED THERE SILENTLY — same data shape, same absent error, just fewer
 * rows. Four such reads shipped in wave 2.
 */
export const COMMUNITY_SCAN_PAGE_SIZE = 1000;

/**
 * Safety valve for `communities` scans: 20 full pages. `communities` holds one
 * row per community, so unlike `MEMBER_COUNT_ROW_BOUND` this bounds the
 * platform's community count directly. A platform past this has outgrown a
 * console with no paging UI; raising the number is not the fix.
 */
export const COMMUNITY_SCAN_ROW_BOUND = 20 * COMMUNITY_SCAN_PAGE_SIZE;

/**
 * The shape a PostgREST `.range()` call resolves to, narrowed to what paging
 * needs.
 *
 * `data` is `unknown[]`, not `T[]`: against the untyped admin client a
 * `.select(<string>)` resolves to `GenericStringError[]`, so pinning the row
 * type here would make every call site cast the builder instead of the rows.
 * The `as T[]` below is the same cast the pre-paging code already wrote at each
 * read, kept in one place.
 */
interface PageResponse {
  data: unknown[] | null;
  error: { message: string } | null;
}

/**
 * The paging loop itself, over a caller-built query.
 *
 * `fetchRowsInPages` (below) can only express `.in(inColumn, ids)`, which is
 * the right shape for the `user_roles` scans it was extracted for and the wrong
 * one for a `communities` read filtered by `is_demo` / `deleted_at`. Rather
 * than widen that signature — `scripts/verify-admin-community-scope.ts` pins
 * it by argument index and re-reads the declaration on every run, so moving a
 * parameter turns that guard's self-test red — the loop is shared and the query
 * stays at the call site, where the scoping predicate is visible to both the
 * reader and the guard.
 *
 * `page(from, to)` is called with each window; the caller applies `.range(from,
 * to)` as the last link of its own chain. Pass an `.order()` that ends in a
 * unique column: paging without a total order lets Postgres return a row twice
 * or not at all across pages.
 */
export async function fetchPagedQuery<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResponse>,
  pageSize: number,
  rowBound: number,
): Promise<PagedRowsResult<T>> {
  const rows: T[] = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await page(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load ${label} (offset ${from}): ${error.message}`);
    }

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    if (!wasTruncated(batch.length, pageSize)) {
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

/**
 * `fetchPagedQuery` for callers that have nowhere honest to put "maybe there
 * were more".
 *
 * `fetchMemberCounts` can degrade a member count to `null` and render "Members
 * unknown"; `ThreadList` can tell the operator the list is truncated. A
 * `communities` scan has neither option: the id set it produces is what every
 * other number on the screen is computed FROM — the portfolio's tab counts, the
 * dashboard's member/document/compliance totals, the charts' scoping — so a
 * partial set does not make one figure unknown, it makes all of them quietly
 * wrong. An error page says that; a short list does not. Same reasoning
 * `clients.ts` already applies to a FAILED communities read ("a failed
 * communities read used to render an empty portfolio — visually identical to a
 * platform with no clients at all"), and that `fetchAllComplianceRows` applies
 * to a failed page mid-scan.
 */
export async function fetchAllRowsInPages<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResponse>,
  pageSize: number,
  rowBound: number,
): Promise<T[]> {
  const { rows, exact } = await fetchPagedQuery<T>(label, page, pageSize, rowBound);

  if (!exact) {
    throw new Error(
      `Refusing to report ${label} from a scan that stopped at ${rowBound} rows: every count ` +
        'derived from it would be wrong without saying so. This surface needs real pagination, ' +
        'not a larger bound.',
    );
  }

  return rows;
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
 *
 * The signature is load-bearing beyond its callers: `SCOPING_HELPERS` in
 * `scripts/verify-admin-community-scope.ts` claims `inColumn` is argument 3 and
 * re-reads this declaration to prove it. Reordering these parameters turns that
 * guard red by design.
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
  if (ids.length === 0) return { rows: [], exact: true };

  return fetchPagedQuery<T>(
    table,
    (from, to) => db.from(table).select(columns).in(inColumn, ids).range(from, to),
    pageSize,
    rowBound,
  );
}
