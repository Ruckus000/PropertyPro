import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEE_POLICY_QUERY_KEY,
  useFeePolicy,
  useUpdateFeePolicy,
} from '../use-fee-policy';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('FEE_POLICY_QUERY_KEY', () => {
  it('preserves the existing stable key shape', () => {
    expect(FEE_POLICY_QUERY_KEY(5)).toEqual(['fee-policy', 5]);
  });
});

describe('useFeePolicy', () => {
  it('does not fetch when communityId is not positive', () => {
    renderHook(() => useFeePolicy(0), { wrapper: createWrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unwraps the nested feePolicy and forwards the signal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { feePolicy: 'owner_pays' } }),
    );
    const { result } = renderHook(() => useFeePolicy(42), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('owner_pays');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/payments/fee-policy?communityId=42',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('surfaces a non-OK response as an error', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'nope' } }),
    );
    const { result } = renderHook(() => useFeePolicy(42), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('refetches when communityId changes', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: { feePolicy: 'association_absorbs' } }),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useFeePolicy(id),
      { wrapper: createWrapper(), initialProps: { id: 1 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/payments/fee-policy?communityId=1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    rerender({ id: 2 });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/v1/payments/fee-policy?communityId=2',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });
});

describe('useUpdateFeePolicy', () => {
  it('PATCHes the exact body and returns the updated policy', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { feePolicy: 'owner_pays' } }),
    );
    const { result } = renderHook(() => useUpdateFeePolicy(9), {
      wrapper: createWrapper(),
    });
    result.current.mutate('owner_pays');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('owner_pays');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/payments/fee-policy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: 9, feePolicy: 'owner_pays' }),
    });
  });

  it('throws the route error message when present', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { message: 'Invalid policy' } }),
    );
    const { result } = renderHook(() => useUpdateFeePolicy(9), {
      wrapper: createWrapper(),
    });
    result.current.mutate('owner_pays');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Invalid policy'));
  });

  it('falls back to the exact "Failed to update fee policy" literal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    const { result } = renderHook(() => useUpdateFeePolicy(9), {
      wrapper: createWrapper(),
    });
    result.current.mutate('association_absorbs');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('Failed to update fee policy'),
    );
  });
});
