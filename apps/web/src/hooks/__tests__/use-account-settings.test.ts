/**
 * Unit tests for the account-settings data hooks (B5 batch #19 drain).
 *
 * Verifies the exact URL/method/headers/body and the byte-for-byte error
 * literal / parse behavior drained verbatim from
 * `account-settings-client.tsx`.
 */
import { createElement, type PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accountDeletionRequestKey,
  useCancelAccountDeletion,
  useDeletionStatus,
  useRequestAccountDeletion,
  useUpdateProfile,
} from '../use-account-settings';

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('accountDeletionRequestKey', () => {
  it('is the stable key the component used', () => {
    expect(accountDeletionRequestKey()).toEqual(['account-deletion-request']);
  });
});

describe('useUpdateProfile', () => {
  it('PATCHes /api/v1/account/profile with JSON body and content-type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ fullName: 'Jane Doe', phone: '555-1234' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/account/profile');
    expect(call[1]).toMatchObject({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(call[1].body as string)).toEqual({
      fullName: 'Jane Doe',
      phone: '555-1234',
    });
  });

  it('passes a null phone through unchanged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ fullName: 'Jane', phone: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      fullName: 'Jane',
      phone: null,
    });
  });

  it('throws the server error message on a non-OK JSON response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { message: 'Name is required' } }),
    );

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ fullName: '', phone: null });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Name is required');
  });

  it('throws the exact fallback literal on a non-OK non-JSON response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not json', { status: 500 }),
    );

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ fullName: 'X', phone: null });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to update profile. Please try again.',
    );
  });

  it('throws the unexpected-error literal when fetch itself rejects', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ fullName: 'X', phone: null });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'An unexpected error occurred. Please try again.',
    );
  });
});

describe('useDeletionStatus', () => {
  it('GETs /api/v1/account/delete and returns json.data', async () => {
    const request = {
      id: 7,
      status: 'cooling',
      coolingEndsAt: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-05-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: request }));

    const { result } = renderHook(() => useDeletionStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(request);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/account/delete');
    expect(fetchMock.mock.calls[0]![1]).toBeUndefined();
  });

  it('returns null on a 404', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));

    const { result } = renderHook(() => useDeletionStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('returns null when json.data is nullish', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: null }));

    const { result } = renderHook(() => useDeletionStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('throws the exact literal on a non-404 non-OK response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));

    const { result } = renderHook(() => useDeletionStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to fetch deletion status',
    );
  });
});

describe('useRequestAccountDeletion', () => {
  it('POSTs /api/v1/account/delete with content-type header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: { id: 9 } }));

    const { result } = renderHook(() => useRequestAccountDeletion(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/account/delete');
    expect(call[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('throws the server message, falling back to the request literal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: { message: 'Reauth required' } }),
    );

    const { result } = renderHook(() => useRequestAccountDeletion(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Reauth required');
  });

  it('uses the exact fallback literal on a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    const { result } = renderHook(() => useRequestAccountDeletion(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to request account deletion.',
    );
  });
});

describe('useCancelAccountDeletion', () => {
  it('DELETEs /api/v1/account/delete', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { cancelled: true } }),
    );

    const { result } = renderHook(() => useCancelAccountDeletion(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/account/delete');
    expect(call[1]).toMatchObject({ method: 'DELETE' });
  });

  it('throws the cancel fallback literal on a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 404 }));

    const { result } = renderHook(() => useCancelAccountDeletion(), {
      wrapper: createWrapper(),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to cancel account deletion.',
    );
  });
});
