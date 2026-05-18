import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  documentVersionsKey,
  useDocumentVersions,
  type DocumentVersionItem,
} from '../use-documents';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const item: DocumentVersionItem = {
  id: 2,
  title: 'Budget',
  fileName: 'budget-v2.pdf',
  fileSize: 2048,
  mimeType: 'application/pdf',
  createdAt: '2026-05-10T12:00:00.000Z',
  uploadedBy: 'Jane Admin',
};

const item2: DocumentVersionItem = {
  id: 5,
  title: 'Budget',
  fileName: 'budget-v1.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  createdAt: '2026-04-01T09:00:00.000Z',
  uploadedBy: null,
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useDocumentVersions', () => {
  it('builds a stable query key including community + document id', () => {
    expect(documentVersionsKey(1, 2)).toEqual(['document-versions', 1, 2]);
  });

  it('uses a "none" key sentinel when documentId is null', () => {
    expect(documentVersionsKey(1, null)).toEqual(['document-versions', 1, 'none']);
  });

  it('does not fetch when documentId is null', () => {
    renderHook(
      () => useDocumentVersions({ communityId: 1, documentId: null }),
      { wrapper: createWrapper() },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when communityId is not positive', () => {
    renderHook(
      () => useDocumentVersions({ communityId: 0, documentId: 2 }),
      { wrapper: createWrapper() },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when documentId is not positive', () => {
    renderHook(
      () => useDocumentVersions({ communityId: 1, documentId: 0 }),
      { wrapper: createWrapper() },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when explicitly disabled', () => {
    renderHook(
      () => useDocumentVersions({ communityId: 1, documentId: 2, enabled: false }),
      { wrapper: createWrapper() },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unwraps the standard { data } envelope into the versions array', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [item, item2] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(
      () => useDocumentVersions({ communityId: 1, documentId: 2 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([item, item2]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/documents/2/versions?communityId=1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('handles an empty version list', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(
      () => useDocumentVersions({ communityId: 1, documentId: 2 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces a non-OK response to the error state', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'boom' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(
      () => useDocumentVersions({ communityId: 1, documentId: 2 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('refetches with a new URL when the documentId changes', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [item] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result, rerender } = renderHook(
      ({ documentId }: { documentId: number }) =>
        useDocumentVersions({ communityId: 1, documentId }),
      { wrapper: createWrapper(), initialProps: { documentId: 2 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/documents/2/versions?communityId=1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    rerender({ documentId: 9 });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/v1/documents/9/versions?communityId=1',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });
});
