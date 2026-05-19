/**
 * Unit tests for useBulkAnnouncements (B5 batch 4B drain).
 *
 * Covers the documented exception to the requestJson rule: the route
 * returns a flat `{ results }` envelope (no `{ data }` wrapper).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useBulkAnnouncements,
  type BulkAnnouncementInput,
} from '../use-bulk-announcements';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const input: BulkAnnouncementInput = {
  communityIds: [1, 2],
  title: 'Pool closure',
  body: 'The pool is closed for maintenance.',
  audience: 'owners_only',
  isPinned: true,
};

describe('useBulkAnnouncements', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs exact URL, method, headers, and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkAnnouncements(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/pm/bulk/announcements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityIds: [1, 2],
        title: 'Pool closure',
        body: 'The pool is closed for maintenance.',
        audience: 'owners_only',
        isPinned: true,
      }),
    });
  });

  it('returns the flat { results } envelope on success', async () => {
    const results = [
      { communityId: 1, communityName: 'Alpha', status: 'sent' as const },
      {
        communityId: 2,
        communityName: 'Beta',
        status: 'failed' as const,
        error: 'boom',
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results }) }),
    );

    const { result } = renderHook(() => useBulkAnnouncements(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ results });
  });

  it('throws the exact route error message on non-OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: 'You do not manage communities: 7' } }),
      }),
    );

    const { result } = renderHook(() => useBulkAnnouncements(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'You do not manage communities: 7',
    );
  });

  it('falls back to the literal when error body is non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    const { result } = renderHook(() => useBulkAnnouncements(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to send bulk announcement',
    );
  });

  it('throws the literal when a 200 success body is non-JSON (no misleading 0/0)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    const { result } = renderHook(() => useBulkAnnouncements(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to send bulk announcement',
    );
  });

  it('throws the literal when a 200 body is missing the results field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );

    const { result } = renderHook(() => useBulkAnnouncements(), { wrapper });
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      'Failed to send bulk announcement',
    );
  });
});
