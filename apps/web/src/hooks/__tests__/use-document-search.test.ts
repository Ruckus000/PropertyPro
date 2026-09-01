/**
 * Unit tests for useDocumentSearch (B5 batch #10 drain).
 *
 * Behavior moved verbatim from components/documents/document-search.tsx.
 * The hook owns the useTransition + raw fetch + state machine. Response is
 * the B1 envelope `{ data: { data: [], pagination } }`.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useDocumentSearch, type DocumentSearchRecord } from '../use-document-search';

function makeRecord(id: number): DocumentSearchRecord {
  return {
    id,
    title: `Doc ${id}`,
    description: id % 2 === 0 ? `Desc ${id}` : null,
    fileName: `file-${id}.pdf`,
    mimeType: 'application/pdf',
    createdAt: '2026-01-01T00:00:00.000Z',
    rank: 1,
  };
}

function okResponse(data: DocumentSearchRecord[], nextCursor: number | null) {
  return {
    ok: true,
    json: async () => ({
      data: { data, pagination: { nextCursor, limit: 20 } },
    }),
  } as unknown as Response;
}

describe('useDocumentSearch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runSearch(q, null) hits exact URL (communityId, q, NO cursor), replaces items, sets nextCursor', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(1), makeRecord(2)], 7));
    const { result } = renderHook(() => useDocumentSearch(42));

    act(() => {
      result.current.runSearch('hello', null);
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toBe('/api/v1/documents/search?communityId=42&q=hello');
    expect(url).not.toContain('cursor');
    expect(result.current.items.map((i) => i.id)).toEqual([1, 2]);
    expect(result.current.nextCursor).toBe(7);
    expect(result.current.error).toBeNull();
  });

  it('runSearch(q, 5) adds cursor=5 and APPENDS to existing items', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(1)], 5));
    const { result } = renderHook(() => useDocumentSearch(9));

    act(() => {
      result.current.runSearch('q', null);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(2), makeRecord(3)], null));
    act(() => {
      result.current.runSearch('q', 5);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    const secondUrl = fetchMock.mock.calls[1]![0] as string;
    expect(secondUrl).toBe('/api/v1/documents/search?communityId=9&q=q&cursor=5');
    expect(result.current.items.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(result.current.nextCursor).toBeNull();
  });

  it('non-OK response sets error = "Search failed (<status>)" and items unchanged', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(1)], null));
    const { result } = renderHook(() => useDocumentSearch(1));
    act(() => {
      result.current.runSearch('q', null);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 } as unknown as Response);
    act(() => {
      result.current.runSearch('q', null);
    });
    await waitFor(() => expect(result.current.error).toBe('Search failed (503)'));
    expect(result.current.items.map((i) => i.id)).toEqual([1]);
  });

  it('non-Error throw falls back to "Search failed"', async () => {
    fetchMock.mockImplementationOnce(() => {
      throw 'boom';
    });
    const { result } = renderHook(() => useDocumentSearch(1));
    act(() => {
      result.current.runSearch('q', null);
    });
    await waitFor(() => expect(result.current.error).toBe('Search failed'));
  });

  it('clears error (setError(null)) at the start of a new search', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    const { result } = renderHook(() => useDocumentSearch(1));
    act(() => {
      result.current.runSearch('q', null);
    });
    await waitFor(() => expect(result.current.error).toBe('Search failed (500)'));

    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(1)], null));
    act(() => {
      result.current.runSearch('q', null);
    });
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('isPending toggles around the transition', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { result } = renderHook(() => useDocumentSearch(1));

    act(() => {
      result.current.runSearch('q', null);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => {
      resolveFetch(okResponse([makeRecord(1)], null));
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.items).toHaveLength(1);
  });

  it('"Load more" after editing the input still paginates the original query', async () => {
    // Fresh search for "cats" → page 1, cursor 5.
    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(1)], 5));
    const { result } = renderHook(() => useDocumentSearch(3));

    act(() => {
      result.current.runSearch('cats', null);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(
      '/api/v1/documents/search?communityId=3&q=cats',
    );

    // User edits the input to "dogs" but clicks "Load more" (cursored)
    // instead of "Search". Pagination must reuse "cats", not "dogs".
    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(2)], null));
    act(() => {
      result.current.runSearch('dogs', 5);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    expect(fetchMock.mock.calls[1]![0]).toBe(
      '/api/v1/documents/search?communityId=3&q=cats&cursor=5',
    );
    expect(result.current.items.map((i) => i.id)).toEqual([1, 2]);
  });

  it('a fresh (cursor-less) search after an edit uses the new query and rebinds pagination', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(1)], 5));
    const { result } = renderHook(() => useDocumentSearch(4));

    act(() => {
      result.current.runSearch('cats', null);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // Fresh search for "dogs" (cursor-less) → replaces results and
    // becomes the new active query.
    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(2)], 9));
    act(() => {
      result.current.runSearch('dogs', null);
    });
    await waitFor(() =>
      expect(result.current.items.map((i) => i.id)).toEqual([2]),
    );
    expect(fetchMock.mock.calls[1]![0]).toBe(
      '/api/v1/documents/search?communityId=4&q=dogs',
    );

    // Subsequent "Load more" now paginates "dogs".
    fetchMock.mockResolvedValueOnce(okResponse([makeRecord(3)], null));
    act(() => {
      result.current.runSearch('dogs', 9);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(fetchMock.mock.calls[2]![0]).toBe(
      '/api/v1/documents/search?communityId=4&q=dogs&cursor=9',
    );
  });

  it('resets items/nextCursor/error when communityId changes', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse([makeRecord(1), makeRecord(2)], 7),
    );
    const { result, rerender } = renderHook(
      ({ cid }: { cid: number }) => useDocumentSearch(cid),
      { initialProps: { cid: 1 } },
    );

    await act(async () => {
      result.current.runSearch('cats', null);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.nextCursor).toBe(7);

    rerender({ cid: 2 });

    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
