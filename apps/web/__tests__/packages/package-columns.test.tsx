import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { getPackageColumns } from '@/components/packages/package-columns';
import type { PackageListItem } from '@/hooks/use-packages';

function statusCell(status: PackageListItem['status'], options?: Parameters<typeof getPackageColumns>[1]) {
  const col = getPackageColumns({ onMarkPickedUp: () => {} }, options).find((c) => c.id === 'status')!;
  const row = { original: { status } } as never;
  return render(<>{(col.cell as (ctx: { row: unknown }) => React.ReactNode)({ row })}</>);
}

describe('getPackageColumns status cell', () => {
  it('keeps the coloured badge and its words by default (the current view)', () => {
    const received = statusCell('received').container.firstElementChild as HTMLElement;
    expect(received).toHaveTextContent('Received');
    expect(received.className).toContain('text-content-link');
    const notified = statusCell('notified').container.firstElementChild as HTMLElement;
    expect(notified).toHaveTextContent('Notified');
    expect(notified.className).toContain('text-status-warning');
    const done = statusCell('picked_up').container.firstElementChild as HTMLElement;
    expect(done).toHaveTextContent('Picked Up');
    expect(done.className).toContain('text-status-success');
  });

  it('uses the supplied renderer when given one', () => {
    const { container } = statusCell('received', { renderStatus: (s) => <i>custom {s}</i> });
    expect(container).toHaveTextContent('custom received');
  });
});
