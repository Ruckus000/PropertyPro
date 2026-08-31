import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcceptInvitation } from '../use-invitations';

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

describe('useAcceptInvitation', () => {
  it('PATCHes the exact body and returns the email on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { success: true, email: 'a@b.com' } }),
    );
    const { result } = renderHook(() => useAcceptInvitation(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ token: 't', communityId: 1, password: 'pw', termsAccepted: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe('a@b.com');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/invitations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // The clickwrap MUST reach the wire. This assertion is the regression
      // guard for the original bug: the form collected `termsAccepted` and the
      // hook dropped it, so invited residents accepted nothing.
      // See docs/audits/2026-08-09-legal-risk-audit.md F-18.
      body: JSON.stringify({ token: 't', communityId: 1, password: 'pw', termsAccepted: true }),
    });
  });

  it('maps TOKEN_USED to the used-link copy', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'TOKEN_USED' } }),
    );
    const { result } = renderHook(() => useAcceptInvitation(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ token: 't', communityId: 1, password: 'pw', termsAccepted: true });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('This invitation link has already been used.'),
    );
  });

  it('maps TOKEN_EXPIRED to the expired-link copy', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(410, { error: { code: 'TOKEN_EXPIRED' } }),
    );
    const { result } = renderHook(() => useAcceptInvitation(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ token: 't', communityId: 1, password: 'pw', termsAccepted: true });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('This invitation link has expired.'),
    );
  });

  it('passes through the route error message when present', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { message: 'Token required' } }),
    );
    const { result } = renderHook(() => useAcceptInvitation(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ token: '', communityId: 1, password: 'pw', termsAccepted: true });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Token required'));
  });

  it('falls back to the exact literal on a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>500</html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const { result } = renderHook(() => useAcceptInvitation(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ token: 't', communityId: 1, password: 'pw', termsAccepted: true });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      new Error('Failed to accept invitation.'),
    );
  });
});
