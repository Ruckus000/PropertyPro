/**
 * Unit tests for useDataSearch (B5 batch #14 relocation drain of
 * command-palette/useDataSearch.ts → hooks/use-data-search.ts).
 *
 * Documented exception to the requestJson rule: the hook is an abortable,
 * multi-keystroke search backed by manual fetch + AbortController. The
 * /api/v1/search route returns the AggregatedSearchResponse at the top level
 * (NOT the standard { data } envelope), and the catch path relies on the bare
 * `${res.status}` thrown error plus AbortSignal-aware swallowing — behaviors
 * requestJson would change. The hook therefore keeps raw fetch verbatim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDataSearch } from '../use-data-search';
import type { SearchGroupConfig } from '../../lib/search/group-config';

const SEARCH_GROUPS: readonly SearchGroupConfig[] = [
  { key: 'documents', label: 'Documents', resource: 'documents' },
  { key: 'announcements', label: 'Announcements', resource: 'announcements' },
] as const;

function aggregatedBody() {
  return {
    requestId: 'req-1',
    communityId: 42,
    partial: false,
    groups: [
      {
        key: 'announcements',
        label: 'Announcements',
        status: 'ok',
        totalCount: 1,
        results: [
          {
            id: 2,
            title: 'Board update',
            subtitle: 'Everyone',
            href: '/announcements/2?communityId=42',
            entityType: 'announcement',
            relevance: 0.9,
          },
        ],
        durationMs: 5,
      },
      {
        key: 'documents',
        label: 'Documents',
        status: 'ok',
        totalCount: 1,
        results: [
          {
            id: 1,
            title: 'Budget',
            subtitle: 'Financials',
            href: '/documents/1',
            entityType: 'document',
            relevance: 0.8,
          },
        ],
        durationMs: 4,
      },
    ],
  };
}

describe('useDataSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes aggregated search results into the configured group order', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => aggregatedBody(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    await act(async () => {
      result.current.search('budget');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.groups.map((group) => group.key)).toEqual([
      'documents',
      'announcements',
    ]);
    expect(result.current.groups.every((group) => group.status === 'ok')).toBe(true);
  });

  it('issues GET /api/v1/search with exact params + abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => aggregatedBody(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    await act(async () => {
      result.current.search('budget');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/search?q=budget&limit=3&communityId=42');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('toggles isSearching around a successful request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => aggregatedBody(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    act(() => {
      result.current.search('budget');
    });
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.isSearching).toBe(false);
  });

  it('throws the bare status code on a non-ok response and surfaces error groups', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    await act(async () => {
      result.current.search('budget');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groups.every((group) => group.status === 'error')).toBe(true);
    expect(result.current.groups[0]?.error).toMatch(/temporarily unavailable/i);
  });

  it('surfaces endpoint failures as explicit group errors instead of empty success state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    await act(async () => {
      result.current.search('budget');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groups.every((group) => group.status === 'error')).toBe(true);
    expect(result.current.groups[0]?.error).toMatch(/temporarily unavailable/i);
  });

  it('swallows an aborted in-flight request when a second search supersedes it', async () => {
    let rejectFirst: ((reason: unknown) => void) | undefined;
    const fetchMock = vi
      .fn()
      // First call: never resolves until we reject it (simulating an abort).
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
            init.signal.addEventListener('abort', () => {
              const abortErr = new Error('aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }),
      )
      // Second call: resolves successfully.
      .mockResolvedValueOnce({
        ok: true,
        json: async () => aggregatedBody(),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    act(() => {
      result.current.search('first');
    });
    act(() => {
      // Supersedes + aborts the first controller.
      result.current.search('second');
    });

    await act(async () => {
      // Drain the first request's AbortError rejection.
      if (rejectFirst) {
        const abortErr = new Error('aborted');
        abortErr.name = 'AbortError';
        rejectFirst(abortErr);
      }
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The first request's rejection was swallowed; the second succeeded.
    expect(result.current.groups.map((group) => group.key)).toEqual([
      'documents',
      'announcements',
    ]);
    expect(result.current.groups.every((group) => group.status === 'ok')).toBe(true);
    expect(result.current.isSearching).toBe(false);
  });

  it('reset() aborts the in-flight request and clears state', async () => {
    const abortSpies: AbortSignal[] = [];
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: { signal: AbortSignal }) => {
        abortSpies.push(init.signal);
        return new Promise(() => {
          /* never resolves */
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    act(() => {
      result.current.search('budget');
    });
    expect(result.current.isSearching).toBe(true);
    expect(result.current.groups).toHaveLength(2);

    act(() => {
      result.current.reset();
    });

    expect(abortSpies[0]!.aborted).toBe(true);
    expect(result.current.groups).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });
});
