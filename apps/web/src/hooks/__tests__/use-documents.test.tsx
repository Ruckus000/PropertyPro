/**
 * Characterization tests for `use-documents.ts` (TST-04 / roadmap 3.T4).
 *
 * `use-documents-versions.test.tsx` already covers `useDocumentVersions`; this
 * file covers the other eight function exports (seven hooks plus
 * `prefetchDocuments`), none of which executed under any test
 * (the three component tests that touch the module `vi.mock` it).
 *
 * What is pinned:
 * - the category filter reaches both the walked URL and the cache key, and
 *   `prefetchDocuments` warms the SAME key `useDocuments` reads;
 * - the download-URL error normalisation (server message surfaced when short
 *   and meaningful; fallback text otherwise);
 * - DELETE/PATCH carry id + communityId in the query string, and the
 *   public-access PATCH omits `redactionAttested` unless given (the contract
 *   body is `.strict()`);
 * - every write invalidates the whole `['documents', communityId]` prefix —
 *   every category slice AND the Deleted column — and nothing else.
 */
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  documentDownloadKey,
  documentVersionsKey,
  documentsKey,
  prefetchDocuments,
  useDeleteDocument,
  useDeletedDocuments,
  useDocumentDownloadUrl,
  useDocuments,
  useDocumentsInvalidator,
  useRestoreDocument,
  useSetDocumentPublicAccess,
} from '../use-documents';

const CID = 9;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function page(items: unknown[]): Response {
  return json({ data: { data: items, pagination: { nextCursor: null, hasMore: false, pageSize: 100 } } });
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(qc: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const UNIVERSE: Record<string, QueryKey> = {
  all: documentsKey(CID, undefined),
  category3: documentsKey(CID, 3),
  deleted: ['documents', CID, 'deleted'],
  otherCommunity: documentsKey(CID + 1, undefined),
  download: documentDownloadKey(CID, 50),
  versions: documentVersionsKey(CID, 50),
};

function seed(qc: QueryClient) {
  for (const key of Object.values(UNIVERSE)) qc.setQueryData(key, { seeded: true });
}

function invalidated(qc: QueryClient): string[] {
  return Object.entries(UNIVERSE)
    .filter(([, key]) => qc.getQueryState(key)?.isInvalidated === true)
    .map(([name]) => name)
    .sort();
}

const COMMUNITY_DOCUMENT_VIEWS = ['all', 'category3', 'deleted'];

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
  return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('useDocuments / prefetchDocuments', () => {
  it('walks /api/v1/documents without a category and caches under the "all" key', async () => {
    fetchMock.mockImplementation(async () => page([{ id: 1 }]));
    const qc = newClient();

    const { result } = renderHook(() => useDocuments({ communityId: CID }), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/documents?communityId=${CID}&pageSize=100`);
    expect(qc.getQueryData(['documents', CID, 'all'])).toEqual([{ id: 1 }]);
  });

  it('sends categoryId and caches under that category slice', async () => {
    fetchMock.mockImplementation(async () => page([{ id: 2 }]));
    const qc = newClient();

    const { result } = renderHook(() => useDocuments({ communityId: CID, categoryId: 3 }), {
      wrapper: wrap(qc),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/documents?communityId=${CID}&categoryId=3&pageSize=100`);
    expect(qc.getQueryData(['documents', CID, 3])).toEqual([{ id: 2 }]);
  });

  it('is disabled by enabled:false and by communityId 0', () => {
    renderHook(
      () => {
        useDocuments({ communityId: CID, enabled: false });
        useDocuments({ communityId: 0 });
      },
      { wrapper: wrap(newClient()) },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefetchDocuments warms the exact key useDocuments reads, and no-ops for communityId 0', async () => {
    fetchMock.mockImplementation(async () => page([{ id: 7 }]));
    const qc = newClient();

    await prefetchDocuments(qc, 0);
    expect(fetchMock).not.toHaveBeenCalled();

    await prefetchDocuments(qc, CID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(documentsKey(CID, undefined))).toEqual([{ id: 7 }]);
  });
});

describe('useDocumentDownloadUrl', () => {
  async function run(response: () => Response) {
    fetchMock.mockImplementation(async () => response());
    const qc = newClient();
    const { result } = renderHook(() => useDocumentDownloadUrl({ communityId: CID, documentId: 50 }), {
      wrapper: wrap(qc),
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    return { result, qc };
  }

  it('fetches the download URL and caches the payload under the download key', async () => {
    const { result, qc } = await run(() => json({ data: { url: 'https://signed/x', fileName: 'x.pdf' } }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/documents/50/download?communityId=${CID}`);
    expect(result.current.data).toEqual({ url: 'https://signed/x', fileName: 'x.pdf' });
    expect(qc.getQueryData(['document-download', CID, 50])).toEqual({ url: 'https://signed/x', fileName: 'x.pdf' });
  });

  it('surfaces a short server message verbatim', async () => {
    const { result } = await run(() => json({ error: { message: 'File is still scanning' } }, 409));
    expect(result.current.error?.message).toBe('File is still scanning');
  });

  it('falls back when the payload has no url', async () => {
    const { result } = await run(() => json({ data: { url: '' } }));
    expect(result.current.error?.message).toBe('Unable to load document preview');
  });

  it('falls back for an over-long server message', async () => {
    const { result } = await run(() => json({ error: { message: 'x'.repeat(201) } }, 500));
    expect(result.current.error?.message).toBe('Unable to load document preview');
  });

  it('falls back for a missing envelope ("Missing response payload")', async () => {
    const { result } = await run(() => json({}));
    expect(result.current.error?.message).toBe('Unable to load document preview');
  });

  it('falls back when the body is not JSON (SyntaxError)', async () => {
    const { result } = await run(() => new Response('<html>502</html>', { status: 502 }));
    expect(result.current.error?.message).toBe('Unable to load document preview');
  });

  it('is disabled for a null documentId', () => {
    renderHook(() => useDocumentDownloadUrl({ communityId: CID, documentId: null }), {
      wrapper: wrap(newClient()),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useDeletedDocuments', () => {
  it('walks with deleted=true under its own key, never the live list key', async () => {
    fetchMock.mockImplementation(async () => page([{ id: 99 }]));
    const qc = newClient();

    const { result } = renderHook(() => useDeletedDocuments({ communityId: CID }), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/documents?communityId=${CID}&deleted=true&pageSize=100`);
    expect(qc.getQueryData(['documents', CID, 'deleted'])).toEqual([{ id: 99 }]);
    expect(qc.getQueryData(documentsKey(CID, undefined))).toBeUndefined();
  });
});

describe('document mutations', () => {
  it('useDeleteDocument sends DELETE with id+communityId in the query and invalidates every community slice', async () => {
    fetchMock.mockImplementation(async () => json({ data: { id: 50 } }));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useDeleteDocument(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync({ id: 50 });
    });

    expect(lastRequest()).toEqual({
      url: `/api/v1/documents?id=50&communityId=${CID}`,
      method: 'DELETE',
      body: undefined,
    });
    expect(invalidated(qc)).toEqual(COMMUNITY_DOCUMENT_VIEWS);
  });

  it('useSetDocumentPublicAccess omits redactionAttested when not given', async () => {
    fetchMock.mockImplementation(async () => json({ data: { id: 50, publicAccess: true } }));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useSetDocumentPublicAccess(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync({ id: 50, publicAccess: true });
    });

    expect(lastRequest()).toEqual({
      url: `/api/v1/documents?id=50&communityId=${CID}`,
      method: 'PATCH',
      body: { publicAccess: true },
    });
    expect(invalidated(qc)).toEqual(COMMUNITY_DOCUMENT_VIEWS);
  });

  it('useSetDocumentPublicAccess forwards redactionAttested, including an explicit false', async () => {
    fetchMock.mockImplementation(async () => json({ data: { id: 50, publicAccess: true } }));
    const { result } = renderHook(() => useSetDocumentPublicAccess(CID), { wrapper: wrap(newClient()) });

    await act(async () => {
      await result.current.mutateAsync({ id: 50, publicAccess: true, redactionAttested: false });
    });
    expect(lastRequest().body).toEqual({ publicAccess: true, redactionAttested: false });
  });

  it('useRestoreDocument PATCHes { restore: true } and refreshes the live AND deleted views', async () => {
    fetchMock.mockImplementation(async () => json({ data: { id: 50, restored: true } }));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useRestoreDocument(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync({ id: 50 });
    });

    expect(lastRequest()).toEqual({
      url: `/api/v1/documents?id=50&communityId=${CID}`,
      method: 'PATCH',
      body: { restore: true },
    });
    expect(invalidated(qc)).toEqual(COMMUNITY_DOCUMENT_VIEWS);
  });

  it('a refused delete invalidates nothing', async () => {
    fetchMock.mockImplementation(async () => json({ error: { message: 'Forbidden' } }, 403));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useDeleteDocument(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 50 })).rejects.toThrow('Forbidden');
    });
    expect(invalidated(qc)).toEqual([]);
  });

  it('useDocumentsInvalidator invalidates the same community prefix without a request', async () => {
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useDocumentsInvalidator(CID), { wrapper: wrap(qc) });
    act(() => {
      result.current();
    });

    await waitFor(() => expect(invalidated(qc)).toEqual(COMMUNITY_DOCUMENT_VIEWS));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
