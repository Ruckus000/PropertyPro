import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentCategoryFilter } from '../../src/components/documents/document-category-filter';

function categoriesResponse(rows: Array<{ id: number; name: string; description: null }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { data: rows, pagination: { nextCursor: null, hasMore: false, pageSize: 50 } },
    }),
  });
}

function renderWithQuery(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('document category filter', () => {
  it('renders empty-state message when no categories are configured', async () => {
    vi.stubGlobal('fetch', categoriesResponse([]));

    renderWithQuery(
      <DocumentCategoryFilter communityId={42} selectedCategoryId={null} onCategoryChange={vi.fn()} />,
    );

    expect(await screen.findByText('No categories configured yet.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'All' })).toBeDefined();
  });

  it('renders category chips when categories are available', async () => {
    const onCategoryChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      categoriesResponse([
        { id: 1, name: 'Rules', description: null },
        { id: 2, name: 'Meeting Minutes', description: null },
      ]),
    );

    renderWithQuery(
      <DocumentCategoryFilter
        communityId={42}
        selectedCategoryId={null}
        onCategoryChange={onCategoryChange}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Rules' }));
    expect(screen.getByRole('button', { name: 'Meeting Minutes' })).toBeDefined();
    expect(onCategoryChange).toHaveBeenCalledWith(1);
  });

  it('components on one page share a single categories request', async () => {
    // Opening one document on the Documents page mounted four readers of this
    // list, and each sent its own walk of the endpoint.
    const fetchMock = categoriesResponse([{ id: 1, name: 'Rules', description: null }]);
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <>
        <DocumentCategoryFilter communityId={42} selectedCategoryId={null} onCategoryChange={vi.fn()} />
        <DocumentCategoryFilter communityId={42} selectedCategoryId={null} onCategoryChange={vi.fn()} />
      </>,
    );

    expect(await screen.findAllByRole('button', { name: 'Rules' })).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
