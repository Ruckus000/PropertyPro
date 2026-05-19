/**
 * Unit tests for useUploadLogo (B5 batch #11 drain of
 * onboarding/steps/profile-step.tsx).
 *
 * Documented exception to the requestJson rule: ProfileStep renders the thrown
 * error's `.message` verbatim, so the hook keeps a manual fetch + non-OK throw
 * with the exact literals `'Failed to prepare logo upload'` and
 * `'Failed to upload logo image'`. The second leg PUTs to an EXTERNAL Supabase
 * signed URL (not `/api/v1`), so it also stays raw fetch.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useUploadLogo } from '../use-upload-logo';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useUploadLogo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('presigns then PUTs to the external upload URL and resolves to the path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { uploadUrl: 'https://supabase.example.com/signed/abc', path: 'logos/c42.png' },
        }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['logo-bytes'], 'logo.png', { type: 'image/png' });
    const { result } = renderHook(() => useUploadLogo(), { wrapper });

    const path = await result.current.mutateAsync({ communityId: 42, file });
    expect(path).toBe('logos/c42.png');

    // Presign leg: exact URL + method + headers + body field order.
    const presignCall = fetchMock.mock.calls[0]!;
    expect(presignCall[0]).toBe('/api/v1/upload');
    expect(presignCall[1]).toEqual({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        fileName: 'logo.png',
        fileSize: file.size,
        mimeType: 'image/png',
      }),
    });

    // Upload leg: external signed URL, PUT, content-type = file.type, body = file.
    const putCall = fetchMock.mock.calls[1]!;
    expect(putCall[0]).toBe('https://supabase.example.com/signed/abc');
    expect(putCall[1]).toEqual({
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file,
    });
  });

  it('falls back to application/octet-stream when file has no type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { uploadUrl: 'https://supabase.example.com/signed/xyz', path: 'logos/none' },
        }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'noext', { type: '' });
    const { result } = renderHook(() => useUploadLogo(), { wrapper });

    await result.current.mutateAsync({ communityId: 7, file });

    const putCall = fetchMock.mock.calls[1]!;
    expect((putCall[1] as { headers: Record<string, string> }).headers['content-type']).toBe(
      'application/octet-stream',
    );
  });

  it('rejects with "Failed to prepare logo upload" when presign is not ok (PUT never called)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const { result } = renderHook(() => useUploadLogo(), { wrapper });

    await expect(result.current.mutateAsync({ communityId: 1, file })).rejects.toThrow(
      'Failed to prepare logo upload',
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects with "Failed to upload logo image" when the PUT is not ok', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { uploadUrl: 'https://supabase.example.com/signed/abc', path: 'logos/c1.png' },
        }),
      })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const { result } = renderHook(() => useUploadLogo(), { wrapper });

    await expect(result.current.mutateAsync({ communityId: 1, file })).rejects.toThrow(
      'Failed to upload logo image',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
