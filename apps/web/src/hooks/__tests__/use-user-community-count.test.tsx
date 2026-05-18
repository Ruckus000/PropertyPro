import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  USER_COMMUNITY_COUNT_QUERY_KEY,
  useUserCommunityCount,
} from '../use-user-community-count';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useUserCommunityCount', () => {
  it('uses the stable query key', () => {
    expect(USER_COMMUNITY_COUNT_QUERY_KEY).toEqual(['user-community-count']);
  });

  it('does not fetch while disabled', () => {
    renderHook(() => useUserCommunityCount(false), { wrapper: createWrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('selects the count out of the standard envelope when enabled', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { count: 3 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useUserCommunityCount(true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/user/communities',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('surfaces request failures to the error state', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Not signed in' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useUserCommunityCount(true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Not signed in'));
  });
});
