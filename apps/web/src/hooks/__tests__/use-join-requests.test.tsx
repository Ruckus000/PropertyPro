import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateJoinRequest,
  type CreateJoinRequestInput,
} from '../use-join-requests';

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

const input: CreateJoinRequestInput = {
  communityId: 7,
  unitIdentifier: 'Unit 101',
  residentType: 'owner',
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useCreateJoinRequest', () => {
  it('POSTs the exact URL, method, and JSON body and resolves on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { data: { requestId: 5, status: 'pending' } }),
    );

    const { result } = renderHook(() => useCreateJoinRequest(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/account/join-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        communityId: 7,
        unitIdentifier: 'Unit 101',
        residentType: 'owner',
      }),
    });
  });

  it.each([
    ['already_member', "You're already a member of this community."],
    [
      'pending_request',
      'You already have a pending request for this community.',
    ],
    [
      'recently_denied',
      'A previous request for this community was denied in the last 30 days. Please contact your community admin.',
    ],
  ])('maps error.details.reason "%s" to the friendly message', async (reason, msg) => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { details: { reason } } }),
    );

    const { result } = renderHook(() => useCreateJoinRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error(msg));
  });

  it('maps a known error.code (no details.reason) through the message map', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'pending_request' } }),
    );

    const { result } = renderHook(() => useCreateJoinRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('You already have a pending request for this community.'),
    );
  });

  it('falls back to error.message when reason/code are unmapped', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: 'something_else', message: 'Invalid request' } }),
    );

    const { result } = renderHook(() => useCreateJoinRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Invalid request'));
  });

  it('falls back to the generic literal when no reason/code/message present', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));

    const { result } = renderHook(() => useCreateJoinRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('Submission failed. Please try again.'),
    );
  });

  it('still yields the generic literal when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not json', { status: 502 }),
    );

    const { result } = renderHook(() => useCreateJoinRequest(), {
      wrapper: createWrapper(),
    });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('Submission failed. Please try again.'),
    );
  });
});
