'use client';

import {
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowData,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTablePagination } from './data-table-pagination';

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
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
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
  }
}

/**
 * Fully spelled, never assembled — `guard:class-resolution` fails on a class
 * built at runtime, and Tailwind's scanner cannot see one either.
 */
const HIDE_BELOW_CLASS: Record<'sm' | 'md', string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
};

type ResponsiveMeta = { hideBelow?: 'sm' | 'md'; absorbSlack?: boolean } | undefined;

function headerClass(meta: ResponsiveMeta): string | undefined {
  return cn(
    meta?.hideBelow ? HIDE_BELOW_CLASS[meta.hideBelow] : undefined,
    meta?.absorbSlack ? 'w-1/2' : undefined,
  ) || undefined;
}

function cellClass(meta: ResponsiveMeta): string | undefined {
  return cn(
    meta?.hideBelow ? HIDE_BELOW_CLASS[meta.hideBelow] : undefined,
    meta?.absorbSlack ? 'max-w-0' : undefined,
  ) || undefined;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowId?: (originalRow: TData, index: number) => string;
}

function getSelectColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  };
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  isLoading = false,
  emptyMessage = 'No results found.',
  emptyAction,
  rowSelection,
  onRowSelectionChange,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const enableSelection = rowSelection !== undefined && onRowSelectionChange !== undefined;

  const allColumns = enableSelection
    ? [getSelectColumn<TData>(), ...columns]
    : columns;

  const table = useReactTable({
    data,
    columns: allColumns,
    ...(getRowId && { getRowId }),
    pageCount,
    state: {
      ...(pagination && { pagination }),
      ...(sorting && { sorting }),
      ...(rowSelection !== undefined && { rowSelection }),
    },
    onPaginationChange,
    onSortingChange,
    onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: !!onPaginationChange,
    manualSorting: !!onSortingChange,
  });

  const colCount = allColumns.length;
  const skeletonRowCount = pagination?.pageSize ?? 10;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-edge">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={headerClass(header.column.columnDef.meta)}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
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
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cellClass(cell.column.columnDef.meta)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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

      {pagination && onPaginationChange && (
        <DataTablePagination table={table} />
      )}
    </div>
  );
}
