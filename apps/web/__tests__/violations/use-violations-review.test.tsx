import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { listViolationsMock } = vi.hoisted(() => ({ listViolationsMock: vi.fn() }));
vi.mock('@/lib/api/violations', () => ({ listViolations: listViolationsMock }));

import { useViolationsReview } from '@/hooks/use-violations-review';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useViolationsReview', () => {
  beforeEach(() => {
    listViolationsMock.mockReset();
    listViolationsMock.mockResolvedValue({ data: [{ id: 1 }], meta: { total: 1, page: 1, limit: 2000 } });
  });

  it('never calls listViolations when disabled', async () => {
    renderHook(() => useViolationsReview(7, {}, false), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 20));
    expect(listViolationsMock).not.toHaveBeenCalled();
  });

  it('passes filters with page 1, limit 2000 and no status, and returns the items', async () => {
    const filters = { unitId: 3, severity: 'minor' as const, createdAfter: '2026-01-01', createdBefore: '2026-02-01' };
    const { result } = renderHook(() => useViolationsReview(7, filters, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listViolationsMock).toHaveBeenCalledTimes(1);
    const [communityId, params] = listViolationsMock.mock.calls[0]!;
    expect(communityId).toBe(7);
    expect(params).toEqual({ ...filters, page: 1, limit: 2000 });
    expect(params).not.toHaveProperty('status');
    expect(result.current.data).toEqual([{ id: 1 }]);
  });

  it('forwards the query signal', async () => {
    const { result } = renderHook(() => useViolationsReview(7, {}, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listViolationsMock.mock.calls[0]![2]).toBeInstanceOf(AbortSignal);
  });
});
