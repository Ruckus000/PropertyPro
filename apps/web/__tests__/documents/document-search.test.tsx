/**
 * Unit tests for DocumentSearch presenter (B5 batch #10 drain).
 *
 * Post-drain: the component owns only input `query` state + the one-time
 * initialQuery auto-search ref guard. Data fetching lives in
 * `useDocumentSearch`. These tests mock the hook and assert the presenter
 * wiring (form submit / Load more / list render / error / disabled /
 * initialQuery-once). Mirrors __tests__/contracts/contract-table.test.tsx.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { DocumentSearchRecord } from '../../src/hooks/use-document-search';

const runSearchMock = vi.fn();
const useDocumentSearchMock = vi.fn();

vi.mock('@/hooks/use-document-search', () => ({
  useDocumentSearch: (communityId: number) => useDocumentSearchMock(communityId),
}));

import { DocumentSearch } from '../../src/components/documents/document-search';

interface HookShape {
  items: DocumentSearchRecord[];
  nextCursor: number | null;
  error: string | null;
  isPending: boolean;
}

function setHookState(state: Partial<HookShape> = {}) {
  useDocumentSearchMock.mockReturnValue({
    items: state.items ?? [],
    nextCursor: state.nextCursor ?? null,
    error: state.error ?? null,
    isPending: state.isPending ?? false,
    runSearch: runSearchMock,
  });
}

function makeRecord(id: number, description: string | null): DocumentSearchRecord {
  return {
    id,
    title: `Doc ${id}`,
    description,
    fileName: `file-${id}.pdf`,
    mimeType: 'application/pdf',
    createdAt: '2026-01-01T00:00:00.000Z',
    rank: 1,
  };
}

describe('DocumentSearch (presenter)', () => {
  beforeEach(() => {
    runSearchMock.mockReset();
    useDocumentSearchMock.mockReset();
  });

  it('form submit calls runSearch(query, null)', () => {
    setHookState();
    render(<DocumentSearch communityId={42} />);

    const input = screen.getByPlaceholderText('Search documents');
    fireEvent.change(input, { target: { value: 'leases' } });
    fireEvent.submit(input.closest('form')!);

    expect(runSearchMock).toHaveBeenCalledWith('leases', null);
  });

  it('"Load more" calls runSearch(query, nextCursor)', () => {
    setHookState({ nextCursor: 11 });
    render(<DocumentSearch communityId={1} />);

    const input = screen.getByPlaceholderText('Search documents');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(runSearchMock).toHaveBeenCalledWith('x', 11);
  });

  it('renders items with title and description ?? fileName', () => {
    setHookState({ items: [makeRecord(1, 'My desc'), makeRecord(2, null)] });
    render(<DocumentSearch communityId={1} />);

    expect(screen.getByText('Doc 1')).toBeDefined();
    expect(screen.getByText('My desc')).toBeDefined();
    expect(screen.getByText('Doc 2')).toBeDefined();
    expect(screen.getByText('file-2.pdf')).toBeDefined();
  });

  it('renders the error literal in a <p>', () => {
    setHookState({ error: 'Search failed (500)' });
    render(<DocumentSearch communityId={1} />);

    expect(screen.getByText('Search failed (500)')).toBeDefined();
  });

  it('disables Search + Load more buttons when isPending', () => {
    setHookState({ isPending: true, nextCursor: 5 });
    render(<DocumentSearch communityId={1} />);

    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Load more' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('auto-searches once on mount with initialQuery, not again on rerender', () => {
    setHookState();
    const { rerender } = render(<DocumentSearch communityId={1} initialQuery="condo docs" />);

    expect(runSearchMock).toHaveBeenCalledTimes(1);
    expect(runSearchMock).toHaveBeenCalledWith('condo docs', null);

    rerender(<DocumentSearch communityId={1} initialQuery="condo docs" />);
    expect(runSearchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call runSearch on Enter-submit while isPending', () => {
    setHookState({ isPending: true });
    const { container } = render(<DocumentSearch communityId={1} />);
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(runSearchMock).not.toHaveBeenCalled();
  });

  it('does not auto-search when initialQuery is absent', () => {
    setHookState();
    render(<DocumentSearch communityId={1} />);
    expect(runSearchMock).not.toHaveBeenCalled();
  });
});
