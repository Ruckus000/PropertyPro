import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useVendors } from '../use-operations';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => fetchMock.mockReset());

describe('useVendors', () => {
  it('walks paginated /api/v1/vendors pages and returns a flat data array', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              data: [{ id: 1, name: 'Acme Plumbing', isActive: true }],
              pagination: { nextCursor: 'next-page', hasMore: true, pageSize: 100 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              data: [{ id: 2, name: 'Bravo Electric', isActive: true }],
              pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useVendors(42), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 1, name: 'Acme Plumbing', isActive: true },
      { id: 2, name: 'Bravo Electric', isActive: true },
    ]);
    expect(fetchMock.mock.calls[0]![0]).toContain('/api/v1/vendors?communityId=42&pageSize=100');
    expect(fetchMock.mock.calls[1]![0]).toContain(
      '/api/v1/vendors?communityId=42&pageSize=100&cursor=next-page',
    );
  });

  it('is disabled when communityId is 0', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useVendors(0), { wrapper: wrapper(qc) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
