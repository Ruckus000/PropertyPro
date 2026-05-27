import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ComplianceQueue } from '../compliance-queue';

const ITEMS = [
  { id: 1, templateKey: '718_declaration', title: 'Declaration', category: 'governing_documents', status: 'satisfied' as const, documentId: 1, documentPostedAt: '2026-05-01T00:00:00.000Z', deadline: null, rollingWindow: null, isApplicable: true },
  { id: 2, templateKey: '718_insurance', title: 'Insurance', category: 'insurance', status: 'overdue' as const, documentId: null, documentPostedAt: null, deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isApplicable: true },
];

describe('ComplianceQueue', () => {
  it('renders one row per item with a Status pill', () => {
    render(
      <ComplianceQueue
        items={ITEMS}
        canWrite
        onUpload={vi.fn()}
        onLink={vi.fn()}
        onView={vi.fn()}
        onMarkApplicable={vi.fn()}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Declaration')).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeInTheDocument();
    expect(screen.getByText('Satisfied')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('shows filter chips with counts', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Action needed/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /All/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides items that do not match the active filter', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Satisfied/i }));
    expect(screen.getByText('Declaration')).toBeInTheDocument();
    expect(screen.queryByText('Insurance')).not.toBeInTheDocument();
  });

  it('shows "Showing X of Y" and Clear filters affordance when filter is active', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Satisfied/i }));
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    // Both the chip-row chip and the summary-line button are intentional per spec.
    // Use within() to target the chip-row affordance via its filter-group container.
    const filterGroup = screen.getByRole('group', { name: /filter records/i });
    expect(within(filterGroup).getByRole('button', { name: /Clear filters/i })).toBeInTheDocument();
    // Summary-line affordance is also a <button> (keyboard-accessible for both Enter and Space).
    const allClearButtons = screen.getAllByRole('button', { name: /Clear filters/i });
    expect(allClearButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onSelect with the item id when row primary action is clicked', () => {
    const onSelect = vi.fn();
    const onView = vi.fn();
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={onView} onMarkApplicable={vi.fn()} selectedId={null} onSelect={onSelect} />,
    );
    const viewBtns = screen.getAllByRole('button', { name: /View document/i });
    fireEvent.click(viewBtns[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});

describe('ComplianceQueue — sortable headers', () => {
  it('marks Status column as the default sort with aria-sort="descending"', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    const statusHeader = screen.getByRole('columnheader', { name: /status/i });
    expect(statusHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('changes aria-sort when Deadline header is clicked', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    const deadline = screen.getByRole('columnheader', { name: /deadline/i });
    // querySelector may return null; SortableHeader always renders a <button> so this is safe
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sortBtn = deadline.querySelector('button');
    if (sortBtn) fireEvent.click(sortBtn);
    expect(deadline).toHaveAttribute('aria-sort', 'ascending');
  });
});
