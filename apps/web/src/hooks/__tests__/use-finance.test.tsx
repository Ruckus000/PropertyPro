/**
 * use-finance — Query Key & Error Handling Tests
 *
 * Focus: Query key structure correctness (for cache invalidation), error handling
 * in requestJson, and the enabled gate that prevents requests with invalid
 * communityId.
 */
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import {
  useAssessments,
  useDelinquency,
  useLedger,
  FINANCE_KEYS,
  type Assessment,
  type DelinquentUnit,
  type LedgerEntry,
} from '../use-finance';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Query Key Structure
// =============================================================================

describe('FINANCE_KEYS factory', () => {
  it('produces correct assessment key shape', () => {
    const key = FINANCE_KEYS.assessments(42);
    expect(key).toEqual(['finance', 'assessments', 42]);
  });

  it('produces correct delinquency key shape', () => {
    const key = FINANCE_KEYS.delinquency(42);
    expect(key).toEqual(['finance', 'delinquency', 42]);
  });

  it('produces correct ledger key without filters', () => {
    const key = FINANCE_KEYS.ledger(42);
    expect(key).toEqual(['finance', 'ledger', 42, {}]);
  });

  it('produces correct ledger key with filters', () => {
    const key = FINANCE_KEYS.ledger(42, {
      entryType: 'charge',
      unitId: 7,
    });
    expect(key).toEqual([
      'finance',
      'ledger',
      42,
      { entryType: 'charge', unitId: 7 },
    ]);
  });

  it('different communityIds produce different keys', () => {
    const key1 = FINANCE_KEYS.assessments(1);
    const key2 = FINANCE_KEYS.assessments(2);
    expect(key1).not.toEqual(key2);
  });
});

// =============================================================================
// useAssessments
// =============================================================================

describe('useAssessments', () => {
  it('does not fetch when communityId is 0', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useAssessments(0), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fetch when communityId is negative', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useAssessments(-1), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches assessments for valid communityId', async () => {
    const { wrapper } = createWrapper();
    const assessments: Assessment[] = [
      {
        id: 1,
        communityId: 42,
        title: 'Monthly Maintenance',
        description: null,
        amountCents: 35000,
        frequency: 'monthly',
        dueDay: 1,
        lateFeeAmountCents: 2500,
        lateFeeDaysGrace: 15,
        startDate: '2026-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: assessments }),
    });

    const { result } = renderHook(() => useAssessments(42), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(assessments);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/assessments?communityId=42',
      undefined,
    );
  });

  it('handles API error with message extraction', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          error: { message: 'Insufficient permissions' },
        }),
    });

    const { result } = renderHook(() => useAssessments(42), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Insufficient permissions');
  });

  it('handles missing data field in response', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}), // no data field
    });

    const { result } = renderHook(() => useAssessments(42), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Missing response payload');
  });
});

// =============================================================================
// useDelinquency
// =============================================================================

describe('useDelinquency', () => {
  it('does not fetch when communityId is 0', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useDelinquency(0), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns delinquent units on success', async () => {
    const { wrapper } = createWrapper();
    const units: DelinquentUnit[] = [
      {
        unitId: 5,
        unitLabel: 'Unit 301',
        ownerName: 'Smith',
        overdueAmountCents: 75000,
        daysOverdue: 45,
        lineItemCount: 3,
        lienEligible: true,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: units }),
    });

    const { result } = renderHook(() => useDelinquency(42), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.[0]?.lienEligible).toBe(true);
    expect(result.current.data?.[0]?.daysOverdue).toBe(45);
  });
});

// =============================================================================
// useLedger
// =============================================================================

describe('useLedger', () => {
  it('builds correct URL with filters', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    renderHook(
      () =>
        useLedger(42, {
          entryType: 'payment',
          unitId: 7,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('communityId=42');
    expect(url).toContain('entryType=payment');
    expect(url).toContain('unitId=7');
    expect(url).toContain('startDate=2026-01-01');
    expect(url).toContain('endDate=2026-03-31');
    expect(url).toContain('limit=200');
  });

  it('omits undefined filter params from URL', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    renderHook(() => useLedger(42, { entryType: 'charge' }), { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('entryType=charge');
    expect(url).not.toContain('unitId');
    expect(url).not.toContain('startDate');
    expect(url).not.toContain('endDate');
  });

  it('handles network failure', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useLedger(42), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
