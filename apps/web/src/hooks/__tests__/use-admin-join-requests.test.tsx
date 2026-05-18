import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_JOIN_REQUESTS_QUERY_KEY,
  useAdminJoinRequests,
  useReviewJoinRequest,
} from '../use-admin-join-requests';

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

describe('useAdminJoinRequests', () => {
  it('uses the stable query key', () => {
    expect(ADMIN_JOIN_REQUESTS_QUERY_KEY).toEqual(['admin-join-requests']);
  });

  it('unwraps the standard envelope and forwards the signal', async () => {
    const rows = [
      {
        id: 1,
        userId: 'u1',
        communityId: 7,
        unitIdentifier: 'Unit 1',
        residentType: 'owner',
        status: 'pending',
        createdAt: '2026-05-18',
      },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: rows }));

    const { result } = renderHook(() => useAdminJoinRequests(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/join-requests',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('surfaces a non-OK response as an error', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'boom' } }),
    );
    const { result } = renderHook(() => useAdminJoinRequests(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useReviewJoinRequest', () => {
  it('POSTs to the parameterized action URL with the notes body and resolves void', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    const { result } = renderHook(() => useReviewJoinRequest(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ id: 9, action: 'deny', notes: 'no match' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/join-requests/9/deny', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'no match' }),
    });
  });

  it('surfaces a failed action as an error', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { message: 'nope' } }),
    );
    const { result } = renderHook(() => useReviewJoinRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ id: 1, action: 'approve' });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
