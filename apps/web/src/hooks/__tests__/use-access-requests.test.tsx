import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_REQUESTS_QUERY_KEY,
  useApproveAccessRequest,
  useDenyAccessRequest,
} from '../use-access-requests';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
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
  fetchMock.mockReset();
});

describe('useApproveAccessRequest', () => {
  it('posts to the standard approve envelope and invalidates access requests', async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { userId: 'user-123' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useApproveAccessRequest(), { wrapper });

    await result.current.mutateAsync({ requestId: 5, unitId: 3 });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/access-requests/5/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId: 3 }),
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ACCESS_REQUESTS_QUERY_KEY });
    });
  });

  it('preserves optional unit assignment semantics', async () => {
    const { wrapper } = createWrapper();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { userId: 'user-123' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useApproveAccessRequest(), { wrapper });

    await result.current.mutateAsync({ requestId: 5 });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/access-requests/5/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId: undefined }),
    });
  });
});

describe('useDenyAccessRequest', () => {
  it('posts to the standard deny envelope and invalidates access requests', async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { success: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useDenyAccessRequest(), { wrapper });

    await result.current.mutateAsync({ requestId: 7, reason: '  Missing proof of ownership  ' });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/access-requests/7/deny', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Missing proof of ownership' }),
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ACCESS_REQUESTS_QUERY_KEY });
    });
  });

  it('preserves optional denial reason semantics', async () => {
    const { wrapper } = createWrapper();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { success: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useDenyAccessRequest(), { wrapper });

    await result.current.mutateAsync({ requestId: 7, reason: '   ' });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/access-requests/7/deny', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: undefined }),
    });
  });
});
