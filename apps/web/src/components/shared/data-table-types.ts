/**
 * Column types for the shared `DataTable`.
 *
 * These used to come from `@tanstack/react-table`. The library is still in the
 * repo — `pm/portfolio-data-table.tsx` uses it for row selection, pagination and
 * sorting — but it is no longer on the path the other eight tables take, because
 * it cost 57.9 KiB on seven routes to do work none of them asked for:
 * `useReactTable` was passed only `getCoreRowModel()`, with `manualSorting` and
 * `manualPagination` both on, and 86 of 91 render-context usages across every
 * consumer were `row.original`.
 *
 * The shapes below are deliberately a SUBSET of TanStack's, not a reinvention:
 * every existing column definition type-checks against them unchanged. Anything
 * a column might reach for that is missing here is missing on purpose — if you
 * need sorting, selection or pagination, you need `PortfolioDataTable`, which
 * still has the real library behind it.
 */
import type { ReactNode } from 'react';

/**
 * The responsive ladder: a column can declare the width below which it drops
 * out, so a narrow screen loses the LEAST useful column rather than whichever
 * one happened to fall off the right edge.
 *
 * Measured on the Documents screen at 375px before this: a 401px table in a
 * 274px box, with State and Added — the two that answer "what is the compliance
 * posture" — silently cut off.
 *
 * The design prototype specifies 800px and 560px. These are the design system's
 * own `md` (768) and `sm` (640): two one-off breakpoints would fragment the
 * responsive vocabulary every other screen already uses, and the behaviour the
 * ladder exists for — a two-step drop-out rather than every cell wrapping — is
 * unchanged.
 */
export interface ColumnMeta {
  /** Hide this column below the named breakpoint. */
  hideBelow?: 'sm' | 'md';
  /**
   * This column absorbs the table's slack and truncates instead of setting
   * the table's width.
   *
   * Load-bearing, and non-obvious: in an auto-layout table a cell's width is
   * driven by its content, so `truncate` has nothing to truncate against and
   * the longest title dictates the column. `max-width: 0` gives it a floor —
   * the standard technique — and the percentage says which column the
   * remaining space belongs to.
   *
   * Without this the responsive ladder BACKFIRES: hiding columns frees space
   * that the primary column then claims. Measured on Documents at 375px —
   * 401px table before the ladder, 619px after it, 274px with this.
   */
  absorbSlack?: boolean;
  /**
   * Give this column a `max-width: 0` floor WITHOUT `absorbSlack`'s `w-1/2`.
   *
   * The other half of the note above: a column whose cell renders `truncate`
   * but never receives a floor has nothing to truncate against, so it sizes to
   * its content and sets the table's width — starving the `absorbSlack` column
   * it was supposed to leave room for. Measured on Documents: the
   * `Statutory record` column held 277px and squeezed `Record` to 27px.
   *
   * Only one column per table can `absorbSlack` (two `w-1/2` headers leave the
   * rest nothing), so a second truncating column needs this instead.
   */
  clamp?: boolean;
}

/** What a `cell` renderer receives. `row.original` is the datum. */
export interface CellContext<TData> {
  row: {
    /** `getRowId(datum, index)` when supplied, otherwise the row index. */
    id: string;
    original: TData;
    index: number;
  };
}

/**
 * A column.
 *
 * `TValue` is accepted and unused, so existing `ColumnDef<Row, unknown>[]`
 * annotations keep compiling without a sweep through nine files.
 */
export interface ColumnDef<TData, TValue = unknown> {
  id?: string;
  /**
   * Reads `row.original[accessorKey]`. Also the column's identity when `id` is
   * absent, and — when there is no `cell` — what gets rendered. Two real
   * columns depend on that default: `purpose` in `visitor-columns.tsx` and
   * `carrier` in `package-columns.tsx`.
   */
  accessorKey?: string;
  header?: ReactNode | (() => ReactNode);
  cell?: (context: CellContext<TData>) => ReactNode;
  meta?: ColumnMeta;
  /** Accepted for source compatibility; the plain table never sorts. */
  enableSorting?: boolean;
  /** Accepted for source compatibility; the plain table never hides columns. */
  enableHiding?: boolean;
  /** Accepted for source compatibility; widths come from the meta ladder. */
  size?: number;
  /** Present only so `TValue` is used; never read. */
  __value?: TValue;
}
