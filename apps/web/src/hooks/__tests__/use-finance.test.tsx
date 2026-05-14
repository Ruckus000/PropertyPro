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
  useAssessmentLineItems,
  useCreateAssessment,
  useDeleteAssessment,
  useDelinquency,
  useGenerateAssessmentLineItems,
  useLedger,
  useRecentPayments,
  useUpdateAssessment,
  FINANCE_KEYS,
  type Assessment,
  type AssessmentLineItem,
  type AssessmentMutationPayload,
  type DelinquentUnit,
  type PaymentHistoryItem,
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

  it('produces correct payments key shape', () => {
    const key = FINANCE_KEYS.payments(42);
    expect(key).toEqual(['finance', 'payments', 42]);
  });

  it('produces correct assessment line-item key shape', () => {
    const key = FINANCE_KEYS.assessmentLineItems(42, 7);
    expect(key).toEqual(['finance', 'assessments', 42, 7, 'line-items']);
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
      json: () => Promise.resolve({
        data: {
          data: assessments,
          pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
        },
      }),
    });

    const { result } = renderHook(() => useAssessments(42), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(assessments);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/assessments?communityId=42&pageSize=100',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
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

  it('deduplicates simultaneous assessments consumers through the canonical query key', async () => {
    const { wrapper } = createWrapper();
    const assessments: Assessment[] = [
      {
        id: 7,
        communityId: 42,
        title: 'Operating Assessment',
        description: null,
        amountCents: 25000,
        frequency: 'monthly',
        dueDay: 1,
        lateFeeAmountCents: 1500,
        lateFeeDaysGrace: 10,
        startDate: '2026-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          data: assessments,
          pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
        },
      }),
    });

    const { result } = renderHook(
      () => ({
        first: useAssessments(42),
        second: useAssessments(42),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.first.isSuccess).toBe(true);
      expect(result.current.second.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.first.data).toEqual(assessments);
    expect(result.current.second.data).toEqual(assessments);
  });

  it('walks canonical assessment pages while preserving the array return shape', async () => {
    const { wrapper } = createWrapper();
    const firstPage: Assessment[] = [
      {
        id: 10,
        communityId: 42,
        title: 'Active Assessment',
        description: null,
        amountCents: 35000,
        frequency: 'monthly',
        dueDay: 1,
        lateFeeAmountCents: 0,
        lateFeeDaysGrace: 0,
        startDate: '2026-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2026-05-01T00:00:00Z',
      },
    ];
    const secondPage: Assessment[] = [
      {
        id: 9,
        communityId: 42,
        title: 'Inactive Assessment',
        description: null,
        amountCents: 12000,
        frequency: 'one_time',
        dueDay: null,
        lateFeeAmountCents: 0,
        lateFeeDaysGrace: 0,
        startDate: '2026-02-01',
        endDate: null,
        isActive: false,
        createdAt: '2026-04-01T00:00:00Z',
      },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            data: firstPage,
            pagination: { nextCursor: 'cursor-2', hasMore: true, pageSize: 100 },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            data: secondPage,
            pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
          },
        }),
      });

    const { result } = renderHook(() => useAssessments(42), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([...firstPage, ...secondPage]);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/assessments?communityId=42&pageSize=100',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/assessments?communityId=42&pageSize=100&cursor=cursor-2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

// =============================================================================
// Assessment mutations and line items
// =============================================================================

describe('assessment mutation hooks', () => {
  const payload: AssessmentMutationPayload = {
    title: 'Monthly Maintenance',
    description: null,
    amountCents: 35000,
    frequency: 'monthly',
    dueDay: 1,
    lateFeeAmountCents: 2500,
    lateFeeDaysGrace: 15,
  };

  const assessment: Assessment = {
    id: 7,
    communityId: 42,
    ...payload,
    startDate: '2026-01-01',
    endDate: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('loads assessment line items through the finance hook', async () => {
    const { wrapper } = createWrapper();
    const lineItems: AssessmentLineItem[] = [
      {
        id: 10,
        assessmentId: 7,
        unitId: 101,
        amountCents: 35000,
        dueDate: '2026-06-01',
        status: 'pending',
        lateFeeCents: 0,
        paidAt: null,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: lineItems }),
    });

    const { result } = renderHook(() => useAssessmentLineItems(42, 7), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(lineItems);
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/assessments/7/line-items?communityId=42', undefined);
  });

  it('creates assessments with the standard requestJson envelope', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: assessment }),
    });

    const { result } = renderHook(() => useCreateAssessment(42), { wrapper });
    await result.current.mutateAsync(payload);

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: 42, ...payload }),
    });
  });

  it('updates assessments with the standard requestJson envelope', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: assessment }),
    });

    const { result } = renderHook(() => useUpdateAssessment(42, 7), { wrapper });
    await result.current.mutateAsync({ ...payload, isActive: false });

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/assessments/7', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: 42, ...payload, isActive: false }),
    });
  });

  it('deletes assessments using the route query-string community id contract', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { success: true } }),
    });

    const { result } = renderHook(() => useDeleteAssessment(42, 7), { wrapper });
    await result.current.mutateAsync();

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/assessments/7?communityId=42', {
      method: 'DELETE',
    });
  });

  it('generates line items and invalidates finance query families', async () => {
    const { wrapper } = createWrapper();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { insertedCount: 2, skippedCount: 0, dueDate: '2026-06-01' },
        }),
    });

    const { result } = renderHook(() => useGenerateAssessmentLineItems(42, 7), { wrapper });
    await result.current.mutateAsync('2026-06-01');

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/assessments/7/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: 42, dueDate: '2026-06-01' }),
    });
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

  it('does not fetch until explicitly enabled', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useDelinquency(42, { enabled: false }), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
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

    const url = mockFetch.mock.calls[0]![0] as string;
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

    const url = mockFetch.mock.calls[0]![0] as string;
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

  it('does not fetch until explicitly enabled', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useLedger(42, { entryType: 'charge' }, { enabled: false }), {
      wrapper,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// =============================================================================
// useRecentPayments
// =============================================================================

describe('useRecentPayments', () => {
  it('does not fetch until explicitly enabled', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useRecentPayments(42, { enabled: false }), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns payment history on success', async () => {
    const { wrapper } = createWrapper();
    const items: PaymentHistoryItem[] = [
      {
        id: 5,
        unitId: 302,
        amountCents: 45000,
        dueDate: '2026-04-01',
        paidAt: '2026-04-02T15:00:00Z',
        lateFeeCents: 0,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: items }),
    });

    const { result } = renderHook(() => useRecentPayments(42), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(items);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/payments/history?communityId=42',
      undefined,
    );
  });
});
