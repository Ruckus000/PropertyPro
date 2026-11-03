/**
 * Table density. A body row is 40px (16px text at a 1.5 line height plus 8px
 * top and bottom) and a header is 32px. The 52px rows this replaces left a
 * table of 25 rows needing a scroll on a laptop screen.
 *
 * The heights come from the classes on the cells themselves: TableHead carries
 * `h-8`, and TableCell carries `py-2` so its vertical padding is 8px.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function renderTable() {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>101</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe('Table density', () => {
  it('gives the header cell a 32px height (h-8)', () => {
    renderTable();
    const header = screen.getByRole('columnheader');
    expect(header.classList.contains('h-8')).toBe(true);
    expect(header.classList.contains('h-10')).toBe(false);
  });

  it('gives the body cell 8px vertical padding (py-2)', () => {
    renderTable();
    const cell = screen.getByRole('cell');
    expect(cell.classList.contains('py-2')).toBe(true);
    expect(cell.classList.contains('py-3')).toBe(false);
  });
});
