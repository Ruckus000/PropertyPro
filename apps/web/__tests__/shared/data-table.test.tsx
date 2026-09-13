/**
 * Characterization tests for the shared `DataTable`.
 *
 * Written against the TanStack-backed implementation BEFORE it was replaced with
 * a plain renderer, and required to pass unchanged afterwards. That is the whole
 * point of the file: nine screens consume this component — including the finance
 * ledger and delinquency tables — and until now not one of them had a test.
 *
 * Everything here asserts BEHAVIOUR (what is in the DOM, what classes land on
 * which cell), never library internals. A test that reached for a TanStack API
 * could not have survived the swap and would have proved nothing about it.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { DataTable } from '@/components/shared/data-table';
import type { ColumnDef } from '@/components/shared/data-table-types';

interface Row {
  id: number;
  title: string;
  purpose: string | null;
  category: string;
  added: string;
}

const ROWS: Row[] = [
  { id: 1, title: 'Budget 2026', purpose: 'Delivery', category: 'Financial', added: 'Mar 3' },
  { id: 2, title: 'Reserve Study', purpose: null, category: 'Statutory', added: 'Mar 4' },
];

/**
 * `purpose` deliberately has NO `cell`. Two real columns rely on the default
 * renderer this exercises — `purpose` in visitor-columns.tsx and `carrier` in
 * package-columns.tsx — and a replacement that only handled explicit `cell`
 * functions would render them blank with every other test still green.
 */
const COLUMNS: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: 'title',
    header: 'Record',
    cell: ({ row }) => <span className="truncate">{row.original.title}</span>,
    meta: { absorbSlack: true },
  },
  { accessorKey: 'purpose', header: 'Purpose' },
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => row.original.category,
    meta: { hideBelow: 'sm', clamp: true },
  },
  {
    accessorKey: 'added',
    header: 'Added',
    cell: ({ row }) => row.original.added,
    meta: { hideBelow: 'md' },
  },
];

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row, unknown>>> = {}) {
  return render(
    <DataTable<Row, unknown>
      columns={COLUMNS}
      data={ROWS}
      getRowId={(row) => `row-${row.id}`}
      {...props}
    />,
  );
}

/** The `<td>` at `columnIndex` of the row whose first cell reads `title`. */
function cellIn(title: string, columnIndex: number): HTMLElement {
  const row = screen.getByText(title).closest('tr');
  expect(row).not.toBeNull();
  return within(row as HTMLElement).getAllByRole('cell')[columnIndex] as HTMLElement;
}

describe('DataTable — rendering', () => {
  it('renders one header per column, in order', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Record', 'Purpose', 'Category', 'Added']);
  });

  it('renders one row per datum, with every cell', () => {
    renderTable();

    expect(screen.getAllByRole('row')).toHaveLength(ROWS.length + 1); // + header row
    expect(screen.getByText('Budget 2026')).toBeDefined();
    expect(screen.getByText('Reserve Study')).toBeDefined();
    expect(screen.getByText('Financial')).toBeDefined();
    expect(screen.getByText('Mar 4')).toBeDefined();
  });

  it('renders an accessor column that has no `cell` through the default renderer', () => {
    renderTable();

    expect(cellIn('Budget 2026', 1)).toHaveTextContent('Delivery');
  });

  it('renders nothing — not "null" — for a null value in a default-rendered cell', () => {
    renderTable();

    expect(cellIn('Reserve Study', 1).textContent).toBe('');
  });
});

describe('DataTable — the responsive meta ladder', () => {
  it('gives an `absorbSlack` column a half-width header and a clamped cell', () => {
    renderTable();

    expect(screen.getByRole('columnheader', { name: 'Record' }).className).toContain('w-1/2');
    expect(cellIn('Budget 2026', 0).className).toContain('max-w-0');
  });

  it('clamps a `clamp` column WITHOUT giving it the half-width header', () => {
    renderTable();

    const header = screen.getByRole('columnheader', { name: 'Category' });
    expect(header.className).not.toContain('w-1/2');
    expect(cellIn('Budget 2026', 2).className).toContain('max-w-0');
  });

  it('hides a column below its declared breakpoint, on the header and the cell alike', () => {
    renderTable();

    // Fully spelled classes, never assembled — Tailwind cannot see a runtime
    // string and `guard:class-resolution` fails on one.
    expect(screen.getByRole('columnheader', { name: 'Category' }).className).toContain(
      'hidden sm:table-cell',
    );
    expect(cellIn('Budget 2026', 2).className).toContain('hidden sm:table-cell');
    expect(screen.getByRole('columnheader', { name: 'Added' }).className).toContain(
      'hidden md:table-cell',
    );
    expect(cellIn('Budget 2026', 3).className).toContain('hidden md:table-cell');
  });

  it('leaves a column with no meta unstyled by the ladder', () => {
    renderTable();

    const header = screen.getByRole('columnheader', { name: 'Purpose' });
    expect(header.className).not.toContain('hidden');
    expect(header.className).not.toContain('w-1/2');
    expect(cellIn('Budget 2026', 1).className).not.toContain('max-w-0');
  });
});

describe('DataTable — loading, empty and keying', () => {
  it('renders skeleton rows instead of data while loading', () => {
    const { container } = renderTable({ isLoading: true });

    expect(screen.queryByText('Budget 2026')).toBeNull();
    // 10 is the documented default when no pageSize is supplied.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
  });

  it('renders the empty message and its action when there are no rows', () => {
    renderTable({
      data: [],
      emptyMessage: 'Nothing matches those filters.',
      emptyAction: <button type="button">Upload Document</button>,
    });

    expect(screen.getByText('Nothing matches those filters.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Upload Document' })).toBeDefined();
  });

  it('prefers the caller’s emptyMessage over the default', () => {
    renderTable({ data: [] });
    expect(screen.getByText('No results found.')).toBeDefined();
  });

  it('keys rows by `getRowId`, so a re-render with reordered data reuses the nodes', () => {
    const { rerender } = renderTable();
    const first = screen.getByText('Budget 2026').closest('tr');

    rerender(
      <DataTable<Row, unknown>
        columns={COLUMNS}
        data={[...ROWS].reverse()}
        getRowId={(row) => `row-${row.id}`}
      />,
    );

    // Same DOM node, moved — proof the key followed the datum rather than the
    // index. With index keys React would have rewritten the cells in place.
    expect(screen.getByText('Budget 2026').closest('tr')).toBe(first);
  });
});
