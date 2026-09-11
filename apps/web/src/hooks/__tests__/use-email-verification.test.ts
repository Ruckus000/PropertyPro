import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResendVerification } from '../use-email-verification';

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

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useResendVerification', () => {
  it('POSTs the exact URL/method/body/headers and returns ok+status+body on 200', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { sent: true, cooldownSeconds: 120 } }),
    );
    const { result } = renderHook(() => useResendVerification(), {
      wrapper: createWrapper(),
    });

    const res = await result.current.mutateAsync('abc');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/resend-verification',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signupRequestId: 'abc' }),
      },
    );
    expect(res).toEqual({
      ok: true,
      status: 200,
      body: { data: { sent: true, cooldownSeconds: 120 } },
    });
  });

  it('returns ok=false + status 409 + alreadyVerified body (no throw)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        data: { alreadyVerified: true, signupRequestId: 'abc' },
      }),
    );
    const { result } = renderHook(() => useResendVerification(), {
      wrapper: createWrapper(),
    });

    const res = await result.current.mutateAsync('abc');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(res.body.data?.alreadyVerified).toBe(true);
  });

  it('returns ok=false + status 429 + cooldownRemainingSeconds body (no throw)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, {
        error: { message: 'wait', cooldownRemainingSeconds: 90 },
      }),
    );
    const { result } = renderHook(() => useResendVerification(), {
      wrapper: createWrapper(),
    });

    const res = await result.current.mutateAsync('abc');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(res.body.error?.cooldownRemainingSeconds).toBe(90);
  });

  it('returns ok=false + status + error.message on other non-OK (no throw)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'boom' } }),
    );
    const { result } = renderHook(() => useResendVerification(), {
      wrapper: createWrapper(),
    });

    const res = await result.current.mutateAsync('abc');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.body.error?.message).toBe('boom');
  });

  it('rejects (throws) only on a network failure so the component catch fires', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useResendVerification(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync('abc')).rejects.toThrow('offline');
  });
});
