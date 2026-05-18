import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TRANSPARENCY_SETTINGS_QUERY_KEY,
  useTransparencySettings,
  useUpdateTransparencySettings,
} from '../use-transparency';

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

describe('TRANSPARENCY_SETTINGS_QUERY_KEY', () => {
  it('is a stable per-community key', () => {
    expect(TRANSPARENCY_SETTINGS_QUERY_KEY(7)).toEqual([
      'transparency-settings',
      7,
    ]);
  });
});

describe('useTransparencySettings', () => {
  it('does not fetch when communityId is not positive', () => {
    renderHook(() => useTransparencySettings(0), { wrapper: createWrapper() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the exact URL, forwards the signal, and unwraps the envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: { enabled: true, acknowledgedAt: '2026-05-18T00:00:00.000Z' },
      }),
    );

    const { result } = renderHook(() => useTransparencySettings(42), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      enabled: true,
      acknowledgedAt: '2026-05-18T00:00:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/transparency/settings?communityId=42',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('surfaces a non-OK response as an error', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: { message: 'Forbidden' } }),
    );
    const { result } = renderHook(() => useTransparencySettings(42), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Forbidden'));
  });

  it('refetches when communityId changes', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: { enabled: false, acknowledgedAt: null } }),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useTransparencySettings(id),
      { wrapper: createWrapper(), initialProps: { id: 1 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/transparency/settings?communityId=1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    rerender({ id: 2 });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/v1/transparency/settings?communityId=2',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });
});

describe('useUpdateTransparencySettings', () => {
  it('PATCHes the exact body and returns the updated settings', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { enabled: true, acknowledgedAt: 'x' } }),
    );

    const { result } = renderHook(() => useUpdateTransparencySettings(9), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ enabled: true, acknowledged: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ enabled: true, acknowledgedAt: 'x' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/transparency/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 9, enabled: true, acknowledged: true }),
    });
  });

  it('throws the route error message when present', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { message: 'Acknowledge required' } }),
    );
    const { result } = renderHook(() => useUpdateTransparencySettings(9), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ enabled: true, acknowledged: false });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Acknowledge required'));
  });

  it('falls back to the exact "Failed to save settings" literal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    const { result } = renderHook(() => useUpdateTransparencySettings(9), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ enabled: false, acknowledged: false });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Failed to save settings'));
  });

  it('falls back to the exact literal on a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>500</html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const { result } = renderHook(() => useUpdateTransparencySettings(9), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ enabled: true, acknowledged: true });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('Failed to save settings'));
  });
});
