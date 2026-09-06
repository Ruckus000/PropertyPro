/**
 * `Table` wraps every table in an `overflow-auto` div. A scrollable box that
 * cannot be focused cannot be scrolled by anyone who does not use a pointer —
 * WCAG 2.1.1 — and the content it hides is simply gone for them.
 *
 * Measured on the Documents screen at 375px before this fix: the wrapper's
 * clientWidth was 274 against a scrollWidth of 401, with `tabIndex` -1. Two of
 * five columns were unreachable.
 *
 * The tab stop is conditional on purpose: adding one to every table in the app,
 * including the many that fit, would trade an access failure for a nuisance.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';

/**
 * jsdom reports 0 for both metrics, so the overflow has to be simulated. These
 * are the two properties the component compares.
 */
function stubMetrics(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLDivElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      return scrollWidth;
    },
  });
  Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return clientWidth;
    },
  });
}

function clearMetrics() {
  // Both were installed as own accessors on the prototype above; neither
  // existed there before, so removing them restores the native inherited
  // getters. `Reflect.deleteProperty` is the `delete` operator without the
  // readonly-property type complaint.
  Reflect.deleteProperty(HTMLDivElement.prototype, 'scrollWidth');
  Reflect.deleteProperty(HTMLDivElement.prototype, 'clientWidth');
}

function renderTable() {
  return render(
    <Table>
      <TableBody>
        <TableRow>
          <TableCell>Bylaws</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

function wrapperOf(container: HTMLElement): HTMLElement {
  const wrapper = container.querySelector('div.overflow-auto');
  if (!wrapper) throw new Error('expected the scroll wrapper');
  return wrapper as HTMLElement;
}

describe('the table scroll region', () => {
  it('is reachable by keyboard when the table is wider than its box', () => {
    stubMetrics(401, 274);
    try {
      const { container } = renderTable();
      expect(wrapperOf(container).getAttribute('tabindex')).toBe('0');
    } finally {
      clearMetrics();
    }
  });

  it('adds no tab stop when the table already fits', () => {
    // Most tables in the app fit. A focus stop on each of them would be a
    // nuisance for the same keyboard users this is meant to help.
    stubMetrics(274, 274);
    try {
      const { container } = renderTable();
      expect(wrapperOf(container).hasAttribute('tabindex')).toBe(false);
    } finally {
      clearMetrics();
    }
  });

  it('shows a focus ring, so the stop is not a mystery', () => {
    stubMetrics(401, 274);
    try {
      const { container } = renderTable();
      expect(wrapperOf(container).className).toContain('focus-visible:ring-2');
    } finally {
      clearMetrics();
    }
  });

  it('re-measures when rows arrive after mount', async () => {
    // The table is empty on first paint and filled when the query resolves, so
    // a mount-only measurement would decide "fits" before there was anything
    // to overflow.
    stubMetrics(274, 274);
    try {
      const { container, rerender } = renderTable();
      expect(wrapperOf(container).hasAttribute('tabindex')).toBe(false);

      stubMetrics(401, 274);
      await act(async () => {
        rerender(
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Bylaws</TableCell>
                <TableCell>Governing Documents</TableCell>
              </TableRow>
            </TableBody>
          </Table>,
        );
      });

      expect(wrapperOf(container).getAttribute('tabindex')).toBe('0');
    } finally {
      clearMetrics();
    }
  });

  it('still renders the table itself', () => {
    stubMetrics(401, 274);
    try {
      renderTable();
      expect(screen.getByRole('table')).toBeDefined();
      expect(screen.getByText('Bylaws')).toBeDefined();
    } finally {
      clearMetrics();
    }
  });
});
