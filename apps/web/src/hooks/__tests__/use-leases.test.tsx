import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEnrichedLeases } from '../use-leases';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

function jsonOk(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function jsonError(status = 500) {
  return Promise.resolve(
    new Response(JSON.stringify({ error: { message: 'server error' } }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const LEASE = {
  id: 1,
  communityId: 99,
  unitId: 10,
  residentId: 'user-uuid-1',
  startDate: '2025-01-01',
  endDate: '2026-01-01',
  rentAmount: '1500.00',
  status: 'active',
  previousLeaseId: null,
  notes: null,
};

const UNIT = { id: 10, communityId: 99, unitNumber: '101' };
const RESIDENT = { id: 'user-uuid-1', name: 'Jane Smith', email: 'jane@example.com' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEnrichedLeases', () => {
  it('starts with isLoading=true, isEnriching=false', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEnrichedLeases(99), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isEnriching).toBe(false);
  });

  it('transitions to isEnriching=true once leases loaded but enrichment pending', async () => {
    let resolveUnits!: (v: unknown) => void;
    let resolveResidents!: (v: unknown) => void;
    const unitsPromise = new Promise((r) => { resolveUnits = r; });
    const residentsPromise = new Promise((r) => { resolveResidents = r; });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/v1/leases')) return jsonOk({ data: [LEASE] });
      if (url.includes('/api/v1/units')) return unitsPromise as Promise<Response>;
      if (url.includes('/api/v1/residents')) return residentsPromise as Promise<Response>;
      return jsonOk({ data: [] });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEnrichedLeases(99), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnriching).toBe(true);

    // resolve enrichment
    resolveUnits(new Response(JSON.stringify({ data: [UNIT] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    resolveResidents(new Response(JSON.stringify({ data: [RESIDENT] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  });

  it('populates unitNumber and residentName after all fetches settle', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/v1/leases')) return jsonOk({ data: [LEASE] });
      if (url.includes('/api/v1/units')) return jsonOk({ data: [UNIT] });
      if (url.includes('/api/v1/residents')) return jsonOk({ data: [RESIDENT] });
      return jsonOk({ data: [] });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEnrichedLeases(99), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isEnriching).toBe(false);
    });
    expect(result.current.leases).toHaveLength(1);
    expect(result.current.leases[0]!.unitNumber).toBe('101');
    expect(result.current.leases[0]!.residentName).toBe('Jane Smith');
    expect(result.current.leases[0]!.residentEmail).toBe('jane@example.com');
  });

  it('isLoading and isEnriching are never both true simultaneously', async () => {
    const states: Array<{ isLoading: boolean; isEnriching: boolean }> = [];

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/v1/leases')) return jsonOk({ data: [LEASE] });
      if (url.includes('/api/v1/units')) return jsonOk({ data: [UNIT] });
      if (url.includes('/api/v1/residents')) return jsonOk({ data: [RESIDENT] });
      return jsonOk({ data: [] });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEnrichedLeases(99), { wrapper });

    // poll states
    await waitFor(() => {
      states.push({ isLoading: result.current.isLoading, isEnriching: result.current.isEnriching });
      expect(!result.current.isLoading && !result.current.isEnriching).toBe(true);
    });

    for (const s of states) {
      expect(s.isLoading && s.isEnriching).toBe(false);
    }
  });

  it('degrades gracefully when unit is missing (deleted after lease created)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/v1/leases')) return jsonOk({ data: [LEASE] });
      if (url.includes('/api/v1/units')) return jsonOk({ data: [] }); // unit missing
      if (url.includes('/api/v1/residents')) return jsonOk({ data: [RESIDENT] });
      return jsonOk({ data: [] });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEnrichedLeases(99), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isEnriching).toBe(false);
    });
    expect(result.current.leases[0]!.unitNumber).toBeNull();
    expect(result.current.leases[0]!.residentName).toBe('Jane Smith'); // resident still works
  });

  it('sets hasEnrichmentError=true and isError=false when units fetch fails', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/v1/leases')) return jsonOk({ data: [LEASE] });
      if (url.includes('/api/v1/units')) return jsonError(500);
      if (url.includes('/api/v1/residents')) return jsonOk({ data: [RESIDENT] });
      return jsonOk({ data: [] });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEnrichedLeases(99), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isEnriching).toBe(false);
    });
    expect(result.current.hasEnrichmentError).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.leases[0]!.unitNumber).toBeNull();
  });

  it('sets hasEnrichmentError=true when residents fetch fails', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/v1/leases')) return jsonOk({ data: [LEASE] });
      if (url.includes('/api/v1/units')) return jsonOk({ data: [UNIT] });
      if (url.includes('/api/v1/residents')) return jsonError(500);
      return jsonOk({ data: [] });
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useEnrichedLeases(99), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isEnriching).toBe(false);
    });
    expect(result.current.hasEnrichmentError).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.leases[0]!.residentName).toBeNull();
  });
});
