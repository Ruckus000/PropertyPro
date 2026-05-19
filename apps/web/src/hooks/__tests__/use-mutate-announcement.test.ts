import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useMutateAnnouncement } from '../use-mutate-announcement';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useMutateAnnouncement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the create payload to /api/v1/announcements and returns the data envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 99 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutateAnnouncement(), { wrapper });

    const payload = {
      communityId: 7,
      title: 'Pool closed',
      body: '<p>Maintenance</p>',
      audience: 'all' as const,
      isPinned: false,
    };

    const res = await result.current.mutateAsync(payload);

    expect(res).toEqual({ data: { id: 99 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/announcements');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('POSTs the update payload with action/id intact', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 5 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutateAnnouncement(), { wrapper });

    const payload = {
      communityId: 7,
      title: 'Updated title',
      body: '<p>Updated</p>',
      audience: 'owners_only' as const,
      isPinned: true,
      action: 'update' as const,
      id: 5,
    };

    await result.current.mutateAsync(payload);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/announcements');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('throws the server-parsed error.message on a non-OK create response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Title is required' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutateAnnouncement(), { wrapper });

    await expect(
      result.current.mutateAsync({
        communityId: 7,
        title: '',
        body: 'x',
        audience: 'all',
        isPinned: false,
      }),
    ).rejects.toThrow('Title is required');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('throws the top-level message when error.message is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Forbidden' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutateAnnouncement(), { wrapper });

    await expect(
      result.current.mutateAsync({
        communityId: 7,
        title: 'x',
        body: 'x',
        audience: 'all',
        isPinned: false,
      }),
    ).rejects.toThrow('Forbidden');
  });

  it('falls back to the create literal when the error body is not JSON (documented exception path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutateAnnouncement(), { wrapper });

    await expect(
      result.current.mutateAsync({
        communityId: 7,
        title: 'x',
        body: 'x',
        audience: 'all',
        isPinned: false,
      }),
    ).rejects.toThrow('We could not create this announcement.');
  });

  it('falls back to the update literal when the error body is not JSON on the update path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMutateAnnouncement(), { wrapper });

    await expect(
      result.current.mutateAsync({
        communityId: 7,
        title: 'x',
        body: 'x',
        audience: 'all',
        isPinned: false,
        action: 'update',
        id: 3,
      }),
    ).rejects.toThrow('We could not update this announcement.');
  });
});
