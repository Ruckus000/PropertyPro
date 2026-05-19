/**
 * Unit tests for useExportData (B5 batch #8 drain).
 *
 * Covers the documented exception to the requestJson rule: the route
 * returns a binary ZIP blob (no `{ data }` envelope). The hook replicates
 * the original component's error-parsing byte-for-byte (including the
 * `Export failed (<status>)` fallback) and derives the filename from the
 * Content-Disposition header.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useExportData } from '../use-export-data';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useExportData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the exact URL with URLSearchParams communityId', async () => {
    const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'attachment; filename="community-export-42.zip"' },
      blob: async () => blob,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useExportData(), { wrapper });
    result.current.mutate({ communityId: 42 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/export?communityId=42');
    // No options object → default GET method.
    expect(call[1]).toBeUndefined();
  });

  it('returns { blob, filename } from Content-Disposition on success', async () => {
    const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) =>
          h === 'Content-Disposition'
            ? 'attachment; filename="my-custom-name.zip"'
            : null,
      },
      blob: async () => blob,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useExportData(), { wrapper });
    result.current.mutate({ communityId: 7 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      blob,
      filename: 'my-custom-name.zip',
    });
  });

  it('falls back to community-export-<id>.zip when no usable Content-Disposition', async () => {
    const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      blob: async () => blob,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useExportData(), { wrapper });
    result.current.mutate({ communityId: 99 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.filename).toBe('community-export-99.zip');
  });

  it('throws the parsed API error message on non-OK JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'You lack permission to export.' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useExportData(), { wrapper });
    result.current.mutate({ communityId: 1 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('You lack permission to export.');
  });

  it('uses the Export failed (<status>) fallback on non-OK non-JSON body', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useExportData(), { wrapper });
    result.current.mutate({ communityId: 1 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Export failed (500)');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to parse error response from export API:',
      expect.any(SyntaxError),
    );
    consoleSpy.mockRestore();
  });
});
