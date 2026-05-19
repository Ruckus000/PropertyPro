/**
 * Unit tests for useBillingGroup (B5 batch 20 drain of PmDashboardClient.tsx).
 *
 * Documented exception to the requestJson rule: the dashboard renders the
 * thrown error's `.message` verbatim in a warning AlertBanner, so the hook
 * keeps a manual fetch + non-OK throw with the exact literal
 * 'Failed to fetch billing group' rather than delegating to requestJson
 * (which would change the user-visible copy and the cached data shape).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useBillingGroup } from '../use-billing-group';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useBillingGroup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the { data: { billingGroupId } } envelope on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { billingGroupId: 42 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBillingGroup(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]!).toEqual(['/api/v1/billing-groups/mine']);
    expect(result.current.data).toEqual({ data: { billingGroupId: 42 } });
  });

  it('throws the server error message on a non-OK JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'nope' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBillingGroup(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('nope');
  });

  it('throws the generic literal when the error body is unparseable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('bad')),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBillingGroup(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to fetch billing group');
  });
});
