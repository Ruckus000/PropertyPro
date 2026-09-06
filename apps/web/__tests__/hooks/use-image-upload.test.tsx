import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { useImageUpload } from '@/hooks/use-image-upload';

function makeFile(name = 'photo.jpg', type = 'image/jpeg', size = 1024): File {
  // JSDOM doesn't fully support File, but enough for these unit tests
  return { name, type, size } as unknown as File;
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('useImageUpload', () => {
  it('happy path: presign → PUT → finalize, returns canonical paths', async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    // Step 1: presign response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          token: 'abc',
          storagePath: 'community/7/images/hero/photo.jpg',
          expiresAt: '2026-05-27T12:00:00Z',
        },
      }),
    });

    // Step 2: PUT (raw upload) response
    mockFetch.mockResolvedValueOnce({ ok: true });

    // Step 3: finalize response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          variant1600Path: 'community/7/images/hero/photo-1600.webp',
          variant800Path: 'community/7/images/hero/photo-800.webp',
          altText: 'Pool view',
        },
      }),
    });

    const { result } = renderHook(
      () => useImageUpload({ communityId: 7 }),
      { wrapper: makeWrapper() },
    );

    const output = await result.current.mutateAsync({
      file: makeFile(),
      kind: 'hero',
      altText: 'Pool view',
    });

    expect(output).toEqual({
      storagePath: 'community/7/images/hero/photo.jpg',
      variant1600Path: 'community/7/images/hero/photo-1600.webp',
      variant800Path: 'community/7/images/hero/photo-800.webp',
      altText: 'Pool view',
    });

    // Verify step 1 call
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/site/uploads/presign',
      expect.objectContaining({ method: 'POST' }),
    );
    const presignBody = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(presignBody).toMatchObject({
      communityId: 7,
      kind: 'hero',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
    });

    // Verify step 2 PUT call
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://storage.example.com/upload?token=abc',
      expect.objectContaining({ method: 'PUT' }),
    );

    // Verify step 3 finalize call
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      '/api/v1/site/images/finalize',
      expect.objectContaining({ method: 'POST' }),
    );
    const finalizeBody = JSON.parse(mockFetch.mock.calls[2]![1].body as string);
    expect(finalizeBody).toMatchObject({
      communityId: 7,
      storagePath: 'community/7/images/hero/photo.jpg',
      altText: 'Pool view',
    });
  });

  it('forwards cropBox to finalize when provided', async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          uploadUrl: 'https://storage.example.com/upload?token=xyz',
          token: 'xyz',
          storagePath: 'community/7/images/content/banner.jpg',
          expiresAt: '2026-05-27T12:00:00Z',
        },
      }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          variant1600Path: 'community/7/images/content/banner-1600.webp',
          variant800Path: 'community/7/images/content/banner-800.webp',
          altText: 'Banner image',
        },
      }),
    });

    const { result } = renderHook(
      () => useImageUpload({ communityId: 7 }),
      { wrapper: makeWrapper() },
    );

    await result.current.mutateAsync({
      file: makeFile('banner.jpg'),
      kind: 'content',
      altText: 'Banner image',
      cropBox: { x: 10, y: 20, width: 800, height: 400 },
    });

    const finalizeBody = JSON.parse(mockFetch.mock.calls[2]![1].body as string);
    expect(finalizeBody.cropBox).toEqual({ x: 10, y: 20, width: 800, height: 400 });
  });

  it('surfaces server error message when presign returns non-ok (e.g. 413 quota exceeded)', async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: async () => ({
        error: { code: 'QUOTA_EXCEEDED', message: 'Storage quota exceeded' },
      }),
    });

    const { result } = renderHook(
      () => useImageUpload({ communityId: 7 }),
      { wrapper: makeWrapper() },
    );

    await expect(
      result.current.mutateAsync({ file: makeFile(), kind: 'hero', altText: '' }),
    ).rejects.toThrow(/Storage quota exceeded/);

    // Only one fetch call — pipeline aborted at presign
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces upload error when PUT step returns non-ok', async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    // Presign succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          token: 'abc',
          storagePath: 'community/7/images/hero/photo.jpg',
          expiresAt: '2026-05-27T12:00:00Z',
        },
      }),
    });

    // PUT fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const { result } = renderHook(
      () => useImageUpload({ communityId: 7 }),
      { wrapper: makeWrapper() },
    );

    await expect(
      result.current.mutateAsync({ file: makeFile(), kind: 'hero', altText: 'Alt' }),
    ).rejects.toThrow(/Upload failed \(HTTP 503\)/);

    // Only presign + PUT — finalize must NOT be called
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces server error message when finalize returns non-ok', async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          uploadUrl: 'https://storage.example.com/upload?token=abc',
          token: 'abc',
          storagePath: 'community/7/images/hero/photo.jpg',
          expiresAt: '2026-05-27T12:00:00Z',
        },
      }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: { code: 'INTERNAL_ERROR', message: 'Image processing failed' },
      }),
    });

    const { result } = renderHook(
      () => useImageUpload({ communityId: 7 }),
      { wrapper: makeWrapper() },
    );

    await expect(
      result.current.mutateAsync({ file: makeFile(), kind: 'hero', altText: 'Alt' }),
    ).rejects.toThrow(/Image processing failed/);
  });
});
