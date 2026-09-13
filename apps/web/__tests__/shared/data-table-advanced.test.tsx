/**
 * Characterization tests for the table's ADVANCED features — row selection,
 * pagination and sorting.
 *
 * Split from `data-table.test.tsx` because exactly one of the nine consumers
 * uses any of this: `pm/PortfolioTable`, on `/pm/dashboard/communities`. When
 * the plain renderer replaced the shared `DataTable`, these features stayed on
 * `@tanstack/react-table` in a module only that route pulls — so this file's
 * import moves and its assertions do not.
 *
 * Everything is "manual" mode: with `onPaginationChange` / `onSortingChange`
 * supplied, the table computes neither and simply reports intent to the parent,
 * which owns the state. These tests assert exactly that contract.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PortfolioDataTable } from '@/components/pm/portfolio-data-table';
import { DataTableColumnHeader } from '@/components/shared/data-table-column-header';
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table';

interface Row {
  communityId: number;
  name: string;
}

const ROWS: Row[] = [
  { communityId: 11, name: 'Sunset Condos' },
  { communityId: 22, name: 'Palm Shores HOA' },
];

const COLUMNS: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Community" />,
    cell: ({ row }) => row.original.name,
  },
];

const PAGINATION: PaginationState = { pageIndex: 0, pageSize: 10 };

function renderTable(props: Record<string, unknown> = {}) {
  return render(
    <PortfolioDataTable<Row, unknown>
      columns={COLUMNS}
      data={ROWS}
      getRowId={(row) => String(row.communityId)}
      {...props}
    />,
  );
}

describe('the advanced table — row selection', () => {
  it('offers a select-all box and one box per row only when selection is wired', () => {
    renderTable();
    expect(screen.queryByLabelText('Select all')).toBeNull();

    renderTable({ rowSelection: {}, onRowSelectionChange: vi.fn() });
    expect(screen.getByLabelText('Select all')).toBeDefined();
    expect(screen.getAllByLabelText('Select row')).toHaveLength(2);
  });

  it('reports a row toggle to the parent rather than holding the state itself', async () => {
    const onRowSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderTable({ rowSelection: {}, onRowSelectionChange });

    await user.click(screen.getAllByLabelText('Select row')[0]!);

    expect(onRowSelectionChange).toHaveBeenCalled();
  });

  it('shows the select-all box as checked when every row is selected', () => {
    renderTable({ rowSelection: { '11': true, '22': true }, onRowSelectionChange: vi.fn() });

    expect(screen.getByLabelText('Select all')).toHaveAttribute('data-state', 'checked');
  });

  it('shows the select-all box as indeterminate when only some rows are selected', () => {
    renderTable({ rowSelection: { '11': true }, onRowSelectionChange: vi.fn() });

    expect(screen.getByLabelText('Select all')).toHaveAttribute('data-state', 'indeterminate');
  });

  it('marks a selected row so the row style can key off it', () => {
    renderTable({ rowSelection: { '11': true }, onRowSelectionChange: vi.fn() });

    const row = screen.getByText('Sunset Condos').closest('tr');
    expect(row).toHaveAttribute('data-state', 'selected');
  });
});

describe('the advanced table — pagination', () => {
  const paged = { pageCount: 3, pagination: PAGINATION, onPaginationChange: vi.fn() };

  it('renders no pagination controls unless pagination is wired', () => {
    renderTable();
    expect(screen.queryByLabelText('Next page')).toBeNull();
  });

  it('reports the current page against the supplied page count', () => {
    renderTable(paged);
    expect(screen.getByText('Page 1 of 3')).toBeDefined();
  });

  it('disables Previous on the first page and leaves Next available', () => {
    renderTable(paged);

    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).not.toBeDisabled();
  });

  it('disables Next on the last page', () => {
    renderTable({ ...paged, pagination: { pageIndex: 2, pageSize: 10 } });

    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  it('reports a page change to the parent', async () => {
    const onPaginationChange = vi.fn();
    const user = userEvent.setup();
    renderTable({ ...paged, onPaginationChange });

    await user.click(screen.getByLabelText('Next page'));

    expect(onPaginationChange).toHaveBeenCalled();
  });

  it('sizes the loading skeleton to the page size rather than the default ten', () => {
    const { container } = renderTable({
      ...paged,
      pagination: { pageIndex: 0, pageSize: 3 },
      isLoading: true,
    });

    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  });
});

describe('the advanced table — sorting', () => {
  const sorted = (sorting: SortingState, onSortingChange = vi.fn()) => ({
    sorting,
    onSortingChange,
  });

  it('renders a sortable header as a button', () => {
    renderTable(sorted([]));
    expect(screen.getByRole('button', { name: /Community/ })).toBeDefined();
  });

  it('reports a sort toggle to the parent rather than reordering the rows itself', async () => {
    const onSortingChange = vi.fn();
    const user = userEvent.setup();
    renderTable(sorted([], onSortingChange));

    await user.click(screen.getByRole('button', { name: /Community/ }));

    expect(onSortingChange).toHaveBeenCalled();
    // Manual sorting: the row order is the caller's, untouched.
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Sunset Condos')).toBeDefined();
  });

  it('leaves the caller’s row order alone even when a sort is active', () => {
    renderTable(sorted([{ id: 'name', desc: true }]));

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Sunset Condos')).toBeDefined();
    expect(within(rows[1]!).getByText('Palm Shores HOA')).toBeDefined();
  });
});
