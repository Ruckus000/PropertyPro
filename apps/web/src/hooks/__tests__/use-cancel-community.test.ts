import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL_PREVIEW_QUERY_KEY,
  useCancelCommunity,
  useCancelPreview,
  type CancelPreview,
} from '../use-cancel-community';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const preview: CancelPreview = {
  previousTier: 'tier_15',
  newTier: 'tier_10',
  perCommunityBreakdown: [],
  portfolioMonthlyDeltaUsd: -42,
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('CANCEL_PREVIEW_QUERY_KEY', () => {
  it('is a stable per-community key', () => {
    expect(CANCEL_PREVIEW_QUERY_KEY(7)).toEqual(['cancel-preview', 7]);
    expect(CANCEL_PREVIEW_QUERY_KEY(7)).toEqual(CANCEL_PREVIEW_QUERY_KEY(7));
  });
});

describe('useCancelPreview', () => {
  it('does not fetch when disabled', () => {
    renderHook(() => useCancelPreview(99, false), { wrapper: createWrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GETs the exact URL with an AbortSignal and unwraps the envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: preview }));
    const { result } = renderHook(() => useCancelPreview(99, true), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(preview);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/communities/99/cancel-preview',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws exactly "Failed to load impact" on non-OK', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'nope' }));
    const { result } = renderHook(() => useCancelPreview(99, true), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to load impact');
  });
});

describe('useCancelCommunity', () => {
  it('POSTs the exact URL/method and resolves on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { canceled: true, communityId: 5 } }),
    );
    const { result } = renderHook(() => useCancelCommunity(5), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/communities/5/cancel', {
      method: 'POST',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('throws exactly "Cancel failed" on non-OK', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));
    const { result } = renderHook(() => useCancelCommunity(5), {
      wrapper: createWrapper(),
    });
    await expect(result.current.mutateAsync()).rejects.toThrow('Cancel failed');
  });
});
