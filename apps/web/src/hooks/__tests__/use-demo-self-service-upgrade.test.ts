/**
 * Unit tests for useDemoSelfServiceUpgrade (B5 batch 4C drain).
 *
 * Covers the documented exception to the requestJson rule: the route
 * returns a flat `{ checkoutUrl }` / `{ error }` envelope (no `{ data }`
 * wrapper).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useDemoSelfServiceUpgrade,
  type DemoSelfServiceUpgradeInput,
} from '../use-demo-self-service-upgrade';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const input: DemoSelfServiceUpgradeInput = {
  slug: 'sunset-condos',
  planId: 'starter',
  customerEmail: 'owner@example.com',
  customerName: 'Sunset Condos',
};

describe('useDemoSelfServiceUpgrade', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the exact URL, method, headers, and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ checkoutUrl: 'https://stripe.test/checkout' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDemoSelfServiceUpgrade(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/demo/sunset-condos/self-service-upgrade',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: 'starter',
          customerEmail: 'owner@example.com',
          customerName: 'Sunset Condos',
        }),
      },
    );
  });

  it('returns the flat { checkoutUrl } envelope on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ checkoutUrl: 'https://stripe.test/checkout' }),
      }),
    );

    const { result } = renderHook(() => useDemoSelfServiceUpgrade(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      checkoutUrl: 'https://stripe.test/checkout',
    });
  });

  it('throws the exact route error message on non-OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: 'This demo has expired' }),
      }),
    );

    const { result } = renderHook(() => useDemoSelfServiceUpgrade(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('This demo has expired');
  });

  it('falls back to the status literal when error body is non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    const { result } = renderHook(() => useDemoSelfServiceUpgrade(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Request failed (500)');
  });

  it('falls back to the status literal when error body has no error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      }),
    );

    const { result } = renderHook(() => useDemoSelfServiceUpgrade(), {
      wrapper,
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Request failed (403)');
  });
});
