import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  useCreateMaintenanceRequest,
  useCreateWorkOrder,
  useCreateReservation,
  useAmenities,
  useWorkOrders,
  useReservations,
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

describe('useWorkOrders — response roundtrip', () => {
  it('walks the canonical paginated envelope and JS-slices to the requested page (Plan B3)', async () => {
    // Plan B3: route emits `{ data: { data, pagination } }`. The hook walks
    // all pages via `walkPaginated` then JS-slices to the requested
    // page+limit window. `meta.total` is now `walked.length` (capped at
    // MAX_PAGES * pageSize = 2000 — see #228 violations for the same pattern).
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            data: [{
              id: 1, title: 'Fix pump', description: null, unitId: null, vendorId: null,
              priority: 'medium', status: 'created', slaResponseHours: null, slaCompletionHours: null,
              assignedAt: null, startedAt: null, completedAt: null, closedAt: null,
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
              responseSlaBreached: false, completionSlaBreached: false,
            }],
            // hasMore: false short-circuits the walk after this page.
            pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useWorkOrders(42), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    // total reflects the walked length, not a server-side COUNT.
    expect(result.current.data?.meta.total).toBe(1);
    expect(result.current.data?.meta.page).toBe(1);
  });
});

describe('useReservations — response roundtrip', () => {
  it('reads { data, meta } from the double-wrapped envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            data: [{
              id: 7, amenityId: 1, unitId: null, status: 'confirmed',
              startTime: '2026-05-01T14:00:00-04:00', endTime: '2026-05-01T15:00:00-04:00',
              notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            }],
            meta: { page: 1, limit: 20, total: 33 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useReservations(42), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.meta.total).toBe(33);
  });
});

describe('useAmenities — response roundtrip', () => {
  it('walks the canonical paginated envelope and preserves the array return shape', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            data: [{ id: 1, name: 'Clubhouse', description: null, location: null }],
            pagination: { nextCursor: 'cursor-2', hasMore: true, pageSize: 100 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            data: [{ id: 2, name: 'Pool', description: null, location: null }],
            pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAmenities(42), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((amenity) => amenity.name)).toEqual(['Clubhouse', 'Pool']);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/amenities?communityId=42&pageSize=100');
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/amenities?communityId=42&pageSize=100&cursor=cursor-2');
  });
});
