import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  useCreateMaintenanceRequest,
  useCreateWorkOrder,
  useCreateReservation,
} from '../use-operations';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useCreateMaintenanceRequest', () => {
  it('POSTs to /api/v1/maintenance-requests and invalidates list', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 1 } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateMaintenanceRequest(42), { wrapper: wrapper(qc) });

    result.current.mutate({ title: 'Leak', description: 'sink', category: 'plumbing', priority: 'normal' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/maintenance-requests');
    expect(call[1].method).toBe('POST');
    const body = JSON.parse(call[1].body as string);
    expect(body).toMatchObject({ action: 'create', communityId: 42, title: 'Leak' });
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

describe('useCreateWorkOrder', () => {
  it('POSTs to /api/v1/work-orders with the given fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 1 } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreateWorkOrder(42), { wrapper: wrapper(qc) });

    result.current.mutate({
      title: 'Repair pump',
      description: 'Broken',
      priority: 'high',
      unitId: 7,
      vendorId: 3,
      slaResponseHours: 4,
      slaCompletionHours: 24,
      notes: null,
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/work-orders');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ communityId: 42, title: 'Repair pump', vendorId: 3 });
  });
});

describe('useCreateReservation', () => {
  it('POSTs to /api/v1/amenities/[id]/reserve', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 1 } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreateReservation(42), { wrapper: wrapper(qc) });

    result.current.mutate({
      amenityId: 9,
      unitId: 5,
      startTime: '2026-05-01T14:00:00-04:00',
      endTime: '2026-05-01T15:00:00-04:00',
      notes: null,
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/amenities/9/reserve');
  });
});
