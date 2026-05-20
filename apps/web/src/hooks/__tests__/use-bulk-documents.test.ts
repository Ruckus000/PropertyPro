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
      fileNameForError: 'report.pdf',
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

  it('omits fileNameForError from the request body (used only for the error literal)', async () => {
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
      fileNameForError: 'a.pdf',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('fileNameForError');
    expect(Object.keys(parsed).sort()).toEqual(
      ['communityId', 'fileName', 'fileSize', 'mimeType'].sort(),
    );
  });

  it('rejects with the per-file error literal interpolating fileNameForError on non-OK', async () => {
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
        fileNameForError: 'report.pdf',
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
      json: async () => responseBody,
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
