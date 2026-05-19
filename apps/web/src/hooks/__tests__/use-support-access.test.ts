import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useSupportAccess,
  useToggleSupportAccess,
  SUPPORT_ACCESS_QUERY_KEY,
} from '../use-support-access';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }
  return { qc, wrapper };
}

const SAMPLE = {
  consentActive: true,
  consent: {
    id: 1,
    community_id: 42,
    granted_by: 'user-1',
    granted_at: '2026-01-01T00:00:00Z',
    revoked_at: null,
  },
  recentAccess: [
    {
      id: 5,
      event: 'consent_granted',
      admin_user_id: 'user-1',
      metadata: null,
      created_at: '2026-01-02T10:00:00Z',
    },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('SUPPORT_ACCESS_QUERY_KEY', () => {
  it('is stable and community-scoped', () => {
    expect(SUPPORT_ACCESS_QUERY_KEY(42)).toEqual(['support-access', 42]);
    expect(SUPPORT_ACCESS_QUERY_KEY(7)).toEqual(['support-access', 7]);
  });
});

describe('useSupportAccess', () => {
  it('does not fetch when communityId is falsy', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupportAccess(0), { wrapper });

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does not fetch when communityId is negative', async () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useSupportAccess(-1), { wrapper });

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GETs the exact URL with communityId param and forwards the AbortSignal', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => SAMPLE });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupportAccess(42), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/settings/support-access?communityId=42');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns the flat { consentActive, consent, recentAccess } body unchanged', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => SAMPLE });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupportAccess(42), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SAMPLE);
  });

  it('handles an empty recentAccess / null consent payload', async () => {
    const empty = { consentActive: false, consent: null, recentAccess: [] };
    fetchMock.mockResolvedValue({ ok: true, json: async () => empty });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupportAccess(42), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(empty);
  });

  it('throws the server error message on a non-OK response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'You lack permission.' } }),
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupportAccess(42), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('You lack permission.');
  });

  it('falls back to the load literal when a non-OK body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSupportAccess(42), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to load support access settings',
    );
  });

  it('refetches with the new id when communityId changes', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => SAMPLE });
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useSupportAccess(id),
      { wrapper, initialProps: { id: 42 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/settings/support-access?communityId=42',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    rerender({ id: 99 });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/v1/settings/support-access?communityId=99',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });
});

describe('useToggleSupportAccess', () => {
  it('POSTs communityId + enabled and invalidates the support-access query', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useToggleSupportAccess(42), { wrapper });
    result.current.mutate({ enabled: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/settings/support-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: 42, enabled: true }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: SUPPORT_ACCESS_QUERY_KEY(42),
    });
  });

  it('throws the update error message on a non-OK response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Toggle rejected.' } }),
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useToggleSupportAccess(42), { wrapper });
    result.current.mutate({ enabled: false });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Toggle rejected.');
  });

  it('falls back to the update literal when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useToggleSupportAccess(42), { wrapper });
    result.current.mutate({ enabled: true });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to update support access');
  });
});
