import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stripeConnectStatusKey,
  useStripeConnectStatus,
  useStartStripeOnboarding,
} from '../use-stripe-connect';

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

describe('useStripeConnectStatus', () => {
  it('uses a stable per-community key', () => {
    expect(stripeConnectStatusKey(42)).toEqual(['stripe-connect-status', 42]);
  });

  it('requests the status URL with communityId param + signal and unwraps data', async () => {
    const status = {
      connected: true,
      stripeAccountId: 'acct_1',
      onboardingComplete: true,
      chargesEnabled: true,
      payoutsEnabled: false,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: status }));

    const { result } = renderHook(() => useStripeConnectStatus(42), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(status);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/stripe/connect/status?communityId=42',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('surfaces a non-OK status response as an error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    const { result } = renderHook(() => useStripeConnectStatus(42), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useStartStripeOnboarding', () => {
  it('POSTs communityId and returns the onboarding result', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { onboardingUrl: 'https://stripe.test/x' } }),
    );

    const { result } = renderHook(() => useStartStripeOnboarding(7), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ onboardingUrl: 'https://stripe.test/x' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/stripe/connect/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: 7 }),
    });
  });

  it('throws the exact preserved literal on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { message: 'server-specific message' } }),
    );

    const { result } = renderHook(() => useStartStripeOnboarding(7), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('Failed to initiate onboarding'),
    );
  });
});
