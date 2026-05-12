import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useBoardForumThreads } from '../use-board';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useBoardForumThreads', () => {
  it('walks canonical paginated forum thread pages and preserves the consumer array shape', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              data: [{ id: 3, title: 'Pinned', isPinned: true }],
              pagination: { nextCursor: 'next', hasMore: true, pageSize: 100 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              data: [{ id: 2, title: 'Newest', isPinned: false }],
              pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBoardForumThreads(42), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 3, title: 'Pinned', isPinned: true },
      { id: 2, title: 'Newest', isPinned: false },
    ]);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/forum/threads?communityId=42&pageSize=100');
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/forum/threads?communityId=42&pageSize=100&cursor=next');
  });

  it('preserves legacy limit/offset slicing after walking pages', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            data: [
              { id: 5, title: 'A' },
              { id: 4, title: 'B' },
              { id: 3, title: 'C' },
            ],
            pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(
      () => useBoardForumThreads(42, { limit: 1, offset: 1 }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 4, title: 'B' }]);
  });

  it('is disabled when communityId is 0', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useBoardForumThreads(0), { wrapper: wrapper(qc) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
