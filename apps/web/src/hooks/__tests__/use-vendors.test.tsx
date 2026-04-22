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
  it('fetches /api/v1/vendors?communityId=X and returns data array', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ id: 1, name: 'Acme Plumbing', isActive: true }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useVendors(42), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, name: 'Acme Plumbing', isActive: true }]);
    expect(fetchMock.mock.calls[0]![0]).toContain('/api/v1/vendors?communityId=42');
  });

  it('is disabled when communityId is 0', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useVendors(0), { wrapper: wrapper(qc) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
