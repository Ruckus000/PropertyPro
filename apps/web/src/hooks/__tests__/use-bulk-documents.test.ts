/**
 * Unit tests for usePresignDocumentUpload / useBulkCreateDocuments
 * (B5 batch 27 drain of components/pm/BulkDocumentDialog.tsx).
 *
 * Documented exception to the requestJson rule: the presign hook throws a
 * bespoke per-file literal interpolating the file name
 * ('Failed to prepare upload for <name>'), and the bulk-create hook parses
 * `{ error: { message } }` with the bespoke fallback literal
 * 'Failed to create bulk documents'. Raw fetch preserves the
 * interpolation + bespoke fallback literals byte-for-byte.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  usePresignDocumentUpload,
  useBulkCreateDocuments,
  useBulkUploadDocuments,
} from '../use-bulk-documents';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const COMMUNITY_ID = 7;

describe('usePresignDocumentUpload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/v1/upload with the presign payload and returns body.data', async () => {
    const presignData = {
      path: 'communities/7/uploads/report.pdf',
      uploadUrl: 'https://storage.example.com/presigned-put-url',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: presignData }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePresignDocumentUpload(), { wrapper });

    const returned = await result.current.mutateAsync({
      communityId: COMMUNITY_ID,
      fileName: 'report.pdf',
      fileSize: 12345,
      mimeType: 'application/pdf',
    });

    expect(returned).toEqual(presignData);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/upload');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityId: COMMUNITY_ID,
      fileName: 'report.pdf',
      fileSize: 12345,
      mimeType: 'application/pdf',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('sends only the four documented fields in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { path: 'p', uploadUrl: 'u' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePresignDocumentUpload(), { wrapper });

    await result.current.mutateAsync({
      communityId: COMMUNITY_ID,
      fileName: 'a.pdf',
      fileSize: 1,
      mimeType: 'application/pdf',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ['communityId', 'fileName', 'fileSize', 'mimeType'].sort(),
    );
  });

  it('rejects with the per-file error literal interpolating fileName on non-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'ignored' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePresignDocumentUpload(), { wrapper });

    await expect(
      result.current.mutateAsync({
        communityId: COMMUNITY_ID,
        fileName: 'report.pdf',
        fileSize: 1,
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('Failed to prepare upload for report.pdf');
  });
});

describe('useBulkCreateDocuments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/v1/pm/bulk/documents with the bulk payload and returns the body', async () => {
    const responseBody = {
      results: [
        {
          communityId: 1,
          communityName: 'Sunset Condos',
          status: 'created' as const,
          documentsCreated: 2,
        },
        {
          communityId: 2,
          communityName: 'Palm Shores HOA',
          status: 'failed' as const,
          error: 'storage error',
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: responseBody }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkCreateDocuments(), { wrapper });

    const returned = await result.current.mutateAsync({
      communityIds: [1, 2],
      documents: [
        { fileName: 'a.pdf', storagePath: 'communities/1/a.pdf', description: 'Annual report' },
        { fileName: 'b.pdf', storagePath: 'communities/1/b.pdf', description: null },
      ],
    });

    expect(returned).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/pm/bulk/documents');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      communityIds: [1, 2],
      documents: [
        { fileName: 'a.pdf', storagePath: 'communities/1/a.pdf', description: 'Annual report' },
        { fileName: 'b.pdf', storagePath: 'communities/1/b.pdf', description: null },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rejects with the server error message on non-OK with parseable body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'You are not authorized' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkCreateDocuments(), { wrapper });

    await expect(
      result.current.mutateAsync({
        communityIds: [1],
        documents: [
          { fileName: 'a.pdf', storagePath: 'p', description: null },
        ],
      }),
    ).rejects.toThrow('You are not authorized');
  });

  it('rejects with the bulk-create fallback literal on non-OK with empty body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkCreateDocuments(), { wrapper });

    await expect(
      result.current.mutateAsync({
        communityIds: [1],
        documents: [
          { fileName: 'a.pdf', storagePath: 'p', description: null },
        ],
      }),
    ).rejects.toThrow('Failed to create bulk documents');
  });
});

describe('useBulkUploadDocuments (orchestrator)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeFile(name: string, type = 'application/pdf'): File {
    return new File(['x'], name, { type });
  }

  it('runs presign + S3 PUT per file then bulk-create, calling onProgress between steps', async () => {
    const presigned1 = { path: 'communities/7/a.pdf', uploadUrl: 'https://s3/a' };
    const presigned2 = { path: 'communities/7/b.pdf', uploadUrl: 'https://s3/b' };
    const bulkResult = {
      results: [
        { communityId: 1, communityName: 'A', status: 'created' as const, documentsCreated: 2 },
        { communityId: 2, communityName: 'B', status: 'created' as const, documentsCreated: 2 },
      ],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: presigned1 }) }) // presign a
      .mockResolvedValueOnce({ ok: true }) // S3 PUT a
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: presigned2 }) }) // presign b
      .mockResolvedValueOnce({ ok: true }) // S3 PUT b
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: bulkResult }) }); // bulk-create
    vi.stubGlobal('fetch', fetchMock);

    const onProgress = vi.fn();
    const { result } = renderHook(() => useBulkUploadDocuments({ onProgress }), { wrapper });

    const returned = await result.current.mutateAsync({
      files: [makeFile('a.pdf'), makeFile('b.pdf')],
      communityIds: [1, 2],
      uploadCommunityId: 7,
      description: 'q3 packet',
    });

    expect(returned).toEqual(bulkResult);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // onProgress called with both progress messages, in order.
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      'Uploading files...',
      'Creating document records...',
    ]);

    // Presign POST URL + payload (first file)
    const [presignUrl1, presignInit1] = fetchMock.mock.calls[0]!;
    expect(presignUrl1).toBe('/api/v1/upload');
    expect(presignInit1.method).toBe('POST');
    expect(JSON.parse(presignInit1.body as string)).toEqual({
      communityId: 7,
      fileName: 'a.pdf',
      fileSize: 1,
      mimeType: 'application/pdf',
    });

    // S3 PUT URL + method (first file)
    const [putUrl1, putInit1] = fetchMock.mock.calls[1]!;
    expect(putUrl1).toBe('https://s3/a');
    expect(putInit1.method).toBe('PUT');

    // Bulk-create POST payload
    const [bulkUrl, bulkInit] = fetchMock.mock.calls[4]!;
    expect(bulkUrl).toBe('/api/v1/pm/bulk/documents');
    expect(bulkInit.method).toBe('POST');
    expect(JSON.parse(bulkInit.body as string)).toEqual({
      communityIds: [1, 2],
      documents: [
        { fileName: 'a.pdf', storagePath: 'communities/7/a.pdf', description: 'q3 packet' },
        { fileName: 'b.pdf', storagePath: 'communities/7/b.pdf', description: 'q3 packet' },
      ],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('passes null description through unchanged when caller passes null', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { path: 'p', uploadUrl: 'u' } }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { results: [] } }) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkUploadDocuments(), { wrapper });
    await result.current.mutateAsync({
      files: [makeFile('a.pdf')],
      communityIds: [1],
      uploadCommunityId: 1,
      description: null,
    });

    const [, bulkInit] = fetchMock.mock.calls[2]!;
    const parsed = JSON.parse(bulkInit.body as string) as {
      documents: Array<{ description: unknown }>;
    };
    expect(parsed.documents[0]!.description).toBeNull();
  });

  it('aborts the loop and rejects with the per-file literal on presign non-OK', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'ignored' } }) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkUploadDocuments(), { wrapper });
    await expect(
      result.current.mutateAsync({
        files: [makeFile('report.pdf'), makeFile('never.pdf')],
        communityIds: [1],
        uploadCommunityId: 1,
        description: null,
      }),
    ).rejects.toThrow('Failed to prepare upload for report.pdf');

    // Loop aborted: only the first presign was called; no S3 PUT, no bulk-create.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the loop and rejects with the per-file PUT literal on S3 PUT non-OK', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { path: 'p', uploadUrl: 'u' } }) })
      .mockResolvedValueOnce({ ok: false }); // S3 PUT fails
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkUploadDocuments(), { wrapper });
    await expect(
      result.current.mutateAsync({
        files: [makeFile('report.pdf'), makeFile('never.pdf')],
        communityIds: [1],
        uploadCommunityId: 1,
        description: null,
      }),
    ).rejects.toThrow('Failed to upload report.pdf');

    // Loop aborted: only the first file's presign + PUT ran; no second presign, no bulk-create.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the API error.message when bulk-create fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { path: 'p', uploadUrl: 'u' } }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'community 2 disabled' } }) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkUploadDocuments(), { wrapper });
    await expect(
      result.current.mutateAsync({
        files: [makeFile('a.pdf')],
        communityIds: [1, 2],
        uploadCommunityId: 1,
        description: null,
      }),
    ).rejects.toThrow('community 2 disabled');
  });

  it('falls back to the bespoke literal when bulk-create non-OK has no error.message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { path: 'p', uploadUrl: 'u' } }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkUploadDocuments(), { wrapper });
    await expect(
      result.current.mutateAsync({
        files: [makeFile('a.pdf')],
        communityIds: [1],
        uploadCommunityId: 1,
        description: null,
      }),
    ).rejects.toThrow('Failed to create bulk documents');
  });

  it('works without onProgress callback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { path: 'p', uploadUrl: 'u' } }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { results: [] } }) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBulkUploadDocuments(), { wrapper });
    await result.current.mutateAsync({
      files: [makeFile('a.pdf')],
      communityIds: [1],
      uploadCommunityId: 1,
      description: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
