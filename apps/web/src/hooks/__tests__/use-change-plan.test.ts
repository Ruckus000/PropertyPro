import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useChangePlan } from '../use-change-plan';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useChangePlan', () => {
  it('POSTs the exact URL, method, and JSON body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, planId: 'professional', billingInterval: 'year' }),
    });

    const { result } = renderHook(() => useChangePlan(), { wrapper });
    result.current.mutate({ communityId: 42, planId: 'professional', billingInterval: 'year' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/subscribe/change-plan?communityId=42',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'professional', billingInterval: 'year' }),
      },
    );
  });

  it('unwraps the bespoke success body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, planId: 'essentials', billingInterval: 'month' }),
    });

    const { result } = renderHook(() => useChangePlan(), { wrapper });
    result.current.mutate({ communityId: 1, planId: 'essentials', billingInterval: 'month' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      ok: true,
      planId: 'essentials',
      billingInterval: 'month',
    });
  });

  it('throws the string error message from the error envelope', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'You are already on this plan and billing interval.' }),
    });

    const { result } = renderHook(() => useChangePlan(), { wrapper });
    result.current.mutate({ communityId: 1, planId: 'essentials', billingInterval: 'month' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'You are already on this plan and billing interval.',
    );
  });

  it('throws the nested error.message when error is an object', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: { message: 'Could not update your subscription.' } }),
    });

    const { result } = renderHook(() => useChangePlan(), { wrapper });
    result.current.mutate({ communityId: 1, planId: 'professional', billingInterval: 'year' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Could not update your subscription.');
  });

  it('falls back to a status-coded literal when the body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useChangePlan(), { wrapper });
    result.current.mutate({ communityId: 1, planId: 'essentials', billingInterval: 'month' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Could not change plan (500)');
  });
});
