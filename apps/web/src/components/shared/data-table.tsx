'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CellContext, ColumnDef, ColumnMeta } from './data-table-types';

/**
 * The shared table for the eight screens that render a plain list.
 *
 * ## Why this does not use `@tanstack/react-table`
 *
 * It used to, and the library was doing almost nothing: `useReactTable` was
 * passed only `getCoreRowModel()`, with `manualSorting` and `manualPagination`
 * both on — so it computed neither — and 86 of 91 render-context usages across
 * all nine consumers were `row.original`. v8 always merges `builtInFeatures`
 * (`table-core/.../table.js:46`), so the faceting, grouping, expanding and
 * column-resizing nobody uses could not be shaken out either. That cost
 * **57.9 KiB on seven routes**, five of which were over the 700 KiB hard budget.
 *
 * The one consumer that genuinely uses selection, pagination and sorting —
 * `pm/PortfolioTable` — keeps the real library, in
 * `@/components/pm/portfolio-data-table`. Its route is under budget, and
 * reimplementing a selection state machine to save nothing there would have
 * been the risky half of this change for none of the benefit.
 *
 * So: if you need sorting, row selection or pagination, reach for
 * `PortfolioDataTable`. Do not grow this one back into a table library.
 */

/**
 * Fully spelled, never assembled — `guard:class-resolution` fails on a class
 * built at runtime, and Tailwind's scanner cannot see one either.
 */
const HIDE_BELOW_CLASS: Record<'sm' | 'md', string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
};

function headerClass(meta: ColumnMeta | undefined): string | undefined {
  return cn(
    meta?.hideBelow ? HIDE_BELOW_CLASS[meta.hideBelow] : undefined,
    meta?.absorbSlack ? 'w-1/2' : undefined,
  ) || undefined;
}

function cellClass(meta: ColumnMeta | undefined): string | undefined {
  return cn(
    meta?.hideBelow ? HIDE_BELOW_CLASS[meta.hideBelow] : undefined,
    meta?.absorbSlack || meta?.clamp ? 'max-w-0' : undefined,
  ) || undefined;
}

/** A column's stable identity: its `id`, else its `accessorKey`, else its index. */
function columnKey(column: ColumnDef<unknown>, index: number): string {
  return column.id ?? column.accessorKey ?? String(index);
}

/**
 * `flexRender`'s job: a slot may be a node or a function of the context.
 *
 * The zero-argument form is real — `ledger-table.tsx:101` and
 * `lease-columns.tsx:124` both write `header: () => <div…>` — so the context is
 * passed positionally and simply ignored by those.
 */
function renderSlot<TContext>(
  slot: ReactNode | ((context: TContext) => ReactNode) | undefined,
  context: TContext,
): ReactNode {
  return typeof slot === 'function'
    ? (slot as (context: TContext) => ReactNode)(context)
    : slot;
}

/**
 * What TanStack rendered for a column with an `accessorKey` and no `cell`.
 *
 * `renderValue()` falls back to `null`, so a nullish value renders NOTHING —
 * not the string "null". `purpose` (`visitor-columns.tsx`) and `carrier`
 * (`package-columns.tsx`) are the two columns that depend on this.
 */
function defaultCell<TData>(column: ColumnDef<TData>, datum: TData): ReactNode {
  if (!column.accessorKey) return null;
  const value = (datum as Record<string, unknown>)[column.accessorKey];
  if (value === null || value === undefined) return null;
  return value as ReactNode;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  /**
   * Keys the row. Without it rows key by index, so a re-order rewrites every
   * cell in place instead of moving the node.
   */
  getRowId?: (originalRow: TData, index: number) => string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No results found.',
  emptyAction,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const colCount = columns.length;
  // Matches the pre-existing default: ten skeleton rows when nothing says otherwise.
  const skeletonRowCount = 10;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-edge">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column, columnIndex) => (
                <TableHead
                  key={columnKey(column as ColumnDef<unknown>, columnIndex)}
                  className={headerClass(column.meta)}
                >
                  {renderSlot(column.header, undefined)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: skeletonRowCount }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <TableCell key={`skeleton-${i}-${j}`}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length > 0 ? (
              data.map((datum, rowIndex) => {
                const rowId = getRowId ? getRowId(datum, rowIndex) : String(rowIndex);
                const context: CellContext<TData> = {
                  row: { id: rowId, original: datum, index: rowIndex },
                };
                return (
                  <TableRow key={rowId}>
                    {columns.map((column, columnIndex) => (
                      <TableCell
                        key={`${rowId}-${columnKey(column as ColumnDef<unknown>, columnIndex)}`}
                        className={cellClass(column.meta)}
                      >
                        {column.cell
                          ? renderSlot(column.cell, context)
                          : defaultCell(column, datum)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={colCount} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-content-tertiary">{emptyMessage}</p>
                    {emptyAction}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
