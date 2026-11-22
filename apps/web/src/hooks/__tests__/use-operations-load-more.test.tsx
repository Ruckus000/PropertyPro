import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useMaintenanceRequests, useReservations, useWorkOrders } from '../use-operations';

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** A fetch that has not answered yet, so the next list is still loading. */
function pendingFetch(): { resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; }));
  return { resolve: (response) => resolve(response) };
}

function requestRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, title: `Request ${i + 1}` }));
}

/** The maintenance-requests route's canonical envelope, all rows on one walked page. */
function requestsPage(count: number): Response {
  return json({ data: { data: requestRows(count), pagination: { nextCursor: null, hasMore: false, pageSize: 100 } } });
}

function reservationsPage(count: number, limit: number): Response {
  return json({
    data: {
      data: Array.from({ length: count }, (_, i) => ({ id: i + 1, amenityId: 9, status: 'confirmed' })),
      meta: { page: 1, limit, total: 60 },
    },
  });
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('Load more keeps the rows already on screen', () => {
  it('requests: a longer limit shows the earlier rows while it loads, then the longer list', async () => {
    fetchMock.mockResolvedValueOnce(requestsPage(40));
    const { result, rerender } = renderHook(
      ({ limit }: { limit: number }) =>
        useMaintenanceRequests(42, { scope: 'mine', keepRowsWhileLoadingMore: true, params: { page: 1, limit } }),
      { wrapper: wrapper(client()), initialProps: { limit: 20 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(20);

    const next = pendingFetch();
    rerender({ limit: 40 });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data?.data.map((row) => row.id)).toEqual(requestRows(20).map((row) => row.id));

    next.resolve(requestsPage(40));
    await waitFor(() => expect(result.current.data?.data).toHaveLength(40));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('reservations: a longer limit keeps the earlier rows while it loads', async () => {
    fetchMock.mockResolvedValueOnce(reservationsPage(20, 20));
    const { result, rerender } = renderHook(
      ({ limit }: { limit: number }) => useReservations(42, { page: 1, limit }, { keepRowsWhileLoadingMore: true }),
      { wrapper: wrapper(client()), initialProps: { limit: 20 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    pendingFetch();
    rerender({ limit: 40 });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.data).toHaveLength(20);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/reservations?communityId=42&page=1&limit=40');
  });

  it('work orders: a longer limit keeps the earlier rows while it loads', async () => {
    fetchMock.mockResolvedValueOnce(requestsPage(40));
    const { result, rerender } = renderHook(
      ({ limit }: { limit: number }) => useWorkOrders(42, { page: 1, limit }, { keepRowsWhileLoadingMore: true }),
      { wrapper: wrapper(client()), initialProps: { limit: 20 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    pendingFetch();
    rerender({ limit: 40 });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.data).toHaveLength(20);
  });

  // Controls: only a longer limit keeps rows. Another list's rows never stand in.
  it("shows no rows from another filter or community while that list loads", async () => {
    fetchMock.mockResolvedValueOnce(requestsPage(40));
    const { result, rerender } = renderHook(
      ({ communityId, status }: { communityId: number; status?: string }) =>
        useMaintenanceRequests(communityId, {
          scope: 'mine',
          keepRowsWhileLoadingMore: true,
          params: { status, page: 1, limit: 20 },
        }),
      { wrapper: wrapper(client()), initialProps: { communityId: 42 } as { communityId: number; status?: string } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    pendingFetch();
    rerender({ communityId: 42, status: 'open' });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);

    pendingFetch();
    rerender({ communityId: 43 });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('keeps nothing unless the caller asks for it', async () => {
    fetchMock.mockResolvedValueOnce(reservationsPage(20, 20));
    const { result, rerender } = renderHook(
      ({ limit }: { limit: number }) => useReservations(42, { page: 1, limit }),
      { wrapper: wrapper(client()), initialProps: { limit: 20 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    pendingFetch();
    rerender({ limit: 40 });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
