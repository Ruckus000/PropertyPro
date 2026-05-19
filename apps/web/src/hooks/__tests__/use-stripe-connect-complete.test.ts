import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompleteStripeConnect } from '../use-stripe-connect-complete';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useCompleteStripeConnect', () => {
  const payload = { communityId: 42, code: 'ac_123', state: 'state_raw_b64' };

  it('POSTs to the exact URL with the exact method/headers/body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    const { result } = renderHook(() => useCompleteStripeConnect(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/stripe/connect/complete');
    expect(call[1]).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        code: 'ac_123',
        state: 'state_raw_b64',
      }),
    });
  });

  it('resolves on a successful (ok) response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    const { result } = renderHook(() => useCompleteStripeConnect(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync(payload)).resolves.toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('throws the API error.message on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { message: 'Stripe rejected the code' } }),
    );

    const { result } = renderHook(() => useCompleteStripeConnect(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync(payload)).rejects.toThrow(
      'Stripe rejected the code',
    );
  });

  it('falls back to the default message when the error body has no message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));

    const { result } = renderHook(() => useCompleteStripeConnect(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync(payload)).rejects.toThrow(
      'Failed to complete Stripe setup',
    );
  });

  it('falls back to the default message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useCompleteStripeConnect(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync(payload)).rejects.toThrow(
      'Failed to complete Stripe setup',
    );
  });
});
