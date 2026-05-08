/**
 * Tests for use-packages mutation invalidation.
 *
 * Regression coverage for "log succeeds but list does not refresh".
 * The fix: useCreatePackage / usePickupPackage pass `refetchType: 'all'`
 * so queries that are inactive at mutation time still refetch (rather than
 * showing stale cache the next time they re-mount).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import {
  usePackages,
  useMyPackages,
  useCreatePackage,
  usePickupPackage,
  type PackageListItem,
} from '../use-packages';

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return {
    qc,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

function jsonOk(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

/**
 * Wrap an array as the canonical paginated response envelope (Plan B3) used
 * by `/api/v1/packages` GET. `usePackages` consumes via `walkPaginated`, which
 * expects `{ data: { data: T[], pagination } }`. `hasMore: false` short-circuits
 * the walk after a single page.
 */
function paginatedOk<T>(rows: T[], status = 200) {
  return jsonOk(
    {
      data: {
        data: rows,
        pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
      },
    },
    status,
  );
}

const COMMUNITY_ID = 99;

const PKG_1: PackageListItem = {
  id: 1,
  communityId: COMMUNITY_ID,
  unitId: 10,
  recipientName: 'Jane Smith',
  carrier: 'UPS',
  trackingNumber: '1Z-AAA',
  status: 'received',
  receivedByStaffId: 'staff-uuid',
  pickedUpAt: null,
  pickedUpByName: null,
  notes: null,
  createdAt: '2026-04-16T12:00:00.000Z',
  updatedAt: '2026-04-16T12:00:00.000Z',
};

const PKG_2: PackageListItem = {
  ...PKG_1,
  id: 2,
  recipientName: 'John Doe',
  trackingNumber: '1Z-BBB',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCreatePackage invalidation', () => {
  it('refetches the staff list query after a successful create', async () => {
    // First /api/v1/packages GET → empty list; POST → new pkg; second GET → [PKG_1]
    let listFetchCount = 0;
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/v1/packages?')) {
        listFetchCount += 1;
        return paginatedOk(listFetchCount === 1 ? [] : [PKG_1]);
      }
      if (
        typeof url === 'string'
        && url === '/api/v1/packages'
        && init?.method === 'POST'
      ) {
        return jsonOk({ data: PKG_1 }, 201);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { wrapper } = makeWrapper();
    const list = renderHook(() => usePackages(COMMUNITY_ID), { wrapper });
    await waitFor(() => expect(list.result.current.isLoading).toBe(false));
    expect(list.result.current.data).toEqual([]);

    const create = renderHook(() => useCreatePackage(COMMUNITY_ID), { wrapper });
    await create.result.current.mutateAsync({
      unitNumber: '10',
      recipientName: 'Jane Smith',
      carrier: 'UPS',
    });

    await waitFor(() => expect(list.result.current.data).toEqual([PKG_1]));
    expect(listFetchCount).toBeGreaterThanOrEqual(2);
  });
});

describe('usePickupPackage invalidation (regression for stale "my packages" view)', () => {
  it('refetches useMyPackages even when it is currently inactive', async () => {
    // This is the actual bug: pre-fix, mutation invalidated the cache but
    // refetchType defaulted to 'active', so an unmounted /my observer kept
    // its stale data and the next mount served it without re-fetching.
    let myFetchCount = 0;
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/v1/packages/my?')) {
        myFetchCount += 1;
        // First fetch: package present. Subsequent fetches: gone (picked up).
        return jsonOk({ data: myFetchCount === 1 ? [PKG_1] : [] });
      }
      if (
        typeof url === 'string'
        && url.startsWith('/api/v1/packages/1/pickup')
        && init?.method === 'PATCH'
      ) {
        return jsonOk({ data: { ...PKG_1, status: 'picked_up' as const } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { wrapper } = makeWrapper();

    // 1. Mount the resident /my list and let it resolve.
    const my = renderHook(() => useMyPackages(COMMUNITY_ID), { wrapper });
    await waitFor(() => expect(my.result.current.isLoading).toBe(false));
    expect(my.result.current.data).toEqual([PKG_1]);
    expect(myFetchCount).toBe(1);

    // 2. Unmount it — observer is now inactive (e.g. the user navigated away
    //    or the resident view never rendered because staff was active).
    my.unmount();

    // 3. Staff picks up the package. With refetchType: 'all', the inactive
    //    /my query refetches in the background.
    const pickup = renderHook(() => usePickupPackage(COMMUNITY_ID), { wrapper });
    await pickup.result.current.mutateAsync({
      packageId: 1,
      pickedUpByName: 'Jane Smith',
    });

    // 4. The inactive query should have been refetched while unmounted.
    //    Without refetchType: 'all' this would still be 1.
    await waitFor(() => expect(myFetchCount).toBeGreaterThanOrEqual(2));

    // 5. When the user navigates back to the resident view, the cache is
    //    already fresh — no flicker of stale "still pending" data.
    const my2 = renderHook(() => useMyPackages(COMMUNITY_ID), { wrapper });
    await waitFor(() => expect(my2.result.current.data).toEqual([]));
  });

  it('refetches the active staff list after pickup', async () => {
    // Sanity: the active observer also refreshes (the prior bug scope).
    let listFetchCount = 0;
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/v1/packages?')) {
        listFetchCount += 1;
        return paginatedOk(
          listFetchCount === 1
            ? [PKG_1, PKG_2]
            : [{ ...PKG_1, status: 'picked_up' as const }, PKG_2],
        );
      }
      if (
        typeof url === 'string'
        && url.startsWith('/api/v1/packages/1/pickup')
        && init?.method === 'PATCH'
      ) {
        return jsonOk({ data: { ...PKG_1, status: 'picked_up' as const } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { wrapper } = makeWrapper();
    const list = renderHook(() => usePackages(COMMUNITY_ID), { wrapper });
    await waitFor(() => expect(list.result.current.isLoading).toBe(false));
    expect(list.result.current.data?.[0]?.status).toBe('received');

    const pickup = renderHook(() => usePickupPackage(COMMUNITY_ID), { wrapper });
    await pickup.result.current.mutateAsync({
      packageId: 1,
      pickedUpByName: 'Jane Smith',
    });

    await waitFor(() =>
      expect(list.result.current.data?.[0]?.status).toBe('picked_up'),
    );
  });
});
