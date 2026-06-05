import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createPresignedDownloadUrlMock = vi.fn();
const createPresignedUploadUrlMock = vi.fn();
vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: (...a: unknown[]) => createPresignedDownloadUrlMock(...a),
  createPresignedUploadUrl: (...a: unknown[]) => createPresignedUploadUrlMock(...a),
}));

import { copyStorageObject } from '@/lib/site-assets/copy-object';

beforeEach(() => {
  vi.restoreAllMocks();
  createPresignedDownloadUrlMock.mockReset();
  createPresignedUploadUrlMock.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
});
afterEach(() => { delete process.env.NEXT_PUBLIC_SUPABASE_URL; });

function mockFetchSequence(responses: Array<{ ok: boolean; bytes?: number }>) {
  let i = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const r = responses[i++]!;
    if (r.bytes !== undefined) {
      return new Response(new Uint8Array(r.bytes), { status: r.ok ? 200 : 500 }) as Response;
    }
    return new Response(null, { status: r.ok ? 200 : 500 }) as Response;
  });
}

describe('copyStorageObject', () => {
  it('downloads from the source path and uploads to the dest path, returning byte length', async () => {
    createPresignedDownloadUrlMock.mockResolvedValue('https://proj.supabase.co/dl');
    createPresignedUploadUrlMock.mockResolvedValue({ signedUrl: 'https://proj.supabase.co/up' });
    const fetchSpy = mockFetchSequence([{ ok: true, bytes: 42 }, { ok: true }]);

    const bytes = await copyStorageObject('documents', 'a/from.webp', 'b/to.webp');

    expect(bytes).toBe(42);
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith('documents', 'a/from.webp', expect.any(Number));
    expect(createPresignedUploadUrlMock).toHaveBeenCalledWith('documents', 'b/to.webp', { upsert: true });
    // first fetch = GET download, second = PUT upload
    const putCall = fetchSpy.mock.calls[1]!;
    expect(String(putCall[0])).toBe('https://proj.supabase.co/up');
    expect((putCall[1] as RequestInit).method).toBe('PUT');
  });

  it('resolves a relative signed URL against NEXT_PUBLIC_SUPABASE_URL', async () => {
    createPresignedDownloadUrlMock.mockResolvedValue('/storage/dl');
    createPresignedUploadUrlMock.mockResolvedValue({ signedUrl: '/storage/up' });
    const fetchSpy = mockFetchSequence([{ ok: true, bytes: 10 }, { ok: true }]);

    await copyStorageObject('documents', 'a.webp', 'b.webp');

    expect(String(fetchSpy.mock.calls[0]![0])).toBe('https://proj.supabase.co/storage/dl');
    expect(String(fetchSpy.mock.calls[1]![0])).toBe('https://proj.supabase.co/storage/up');
  });

  it('throws if the source download fails', async () => {
    createPresignedDownloadUrlMock.mockResolvedValue('https://proj.supabase.co/dl');
    mockFetchSequence([{ ok: false, bytes: 0 }]);
    await expect(copyStorageObject('documents', 'a.webp', 'b.webp')).rejects.toThrow();
  });

  it('throws if the upload fails', async () => {
    createPresignedDownloadUrlMock.mockResolvedValue('https://proj.supabase.co/dl');
    createPresignedUploadUrlMock.mockResolvedValue({ signedUrl: 'https://proj.supabase.co/up' });
    mockFetchSequence([{ ok: true, bytes: 5 }, { ok: false }]);
    await expect(copyStorageObject('documents', 'a.webp', 'b.webp')).rejects.toThrow();
  });
});
