/**
 * Unit tests for photo-processor service.
 *
 * Tests cover:
 * - getMaintenancePhotoUploadUrl: returns url/path, pre-upload folder, filename sanitization, upsert flag
 * - processAndStoreThumbnail: success path, MIME validation, fetch failure, sharp failure, download URL failure, path format
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  createPresignedUploadUrlMock,
  createPresignedDownloadUrlMock,
  sanitizeFilenameMock,
  fileTypeFromBufferMock,
  sharpResizeMock,
  sharpWebpMock,
  sharpToBufferMock,
  sharpMock,
} = vi.hoisted(() => {
  const sharpToBufferMock = vi.fn().mockResolvedValue(Buffer.from('thumb-data'));
  const sharpWebpMock = vi.fn();
  const sharpResizeMock = vi.fn();
  const sharpMock = vi.fn();

  // Wire the chainable builder
  sharpResizeMock.mockReturnThis();
  sharpWebpMock.mockReturnThis();
  sharpMock.mockImplementation(() => ({
    resize: sharpResizeMock,
    webp: sharpWebpMock,
    toBuffer: sharpToBufferMock,
  }));

  return {
    createPresignedUploadUrlMock: vi.fn(),
    createPresignedDownloadUrlMock: vi.fn(),
    sanitizeFilenameMock: vi.fn((name: string) => name),
    fileTypeFromBufferMock: vi.fn(),
    sharpResizeMock,
    sharpWebpMock,
    sharpToBufferMock,
    sharpMock,
  };
});

vi.mock('@propertypro/db', () => ({
  createPresignedUploadUrl: createPresignedUploadUrlMock,
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

vi.mock('@/lib/utils/sanitize-filename', () => ({
  sanitizeFilename: sanitizeFilenameMock,
}));

vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeFromBufferMock,
}));

vi.mock('sharp', () => ({
  default: sharpMock,
}));

import {
  getMaintenancePhotoUploadUrl,
  processAndStoreThumbnail,
} from '../../src/lib/services/photo-processor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(...responses: Array<{ ok: boolean; arrayBuffer?: () => Promise<ArrayBuffer> }>) {
  let callIndex = 0;
  vi.spyOn(global, 'fetch').mockImplementation(async () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return resp as unknown as Response;
  });
}

function makeArrayBuffer(data: string): () => Promise<ArrayBuffer> {
  return async () => Buffer.from(data).buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('photo-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default pass-through for sanitize
    sanitizeFilenameMock.mockImplementation((name: string) => name);
    // Restore default sharp chain
    sharpToBufferMock.mockResolvedValue(Buffer.from('thumb-data'));
    sharpResizeMock.mockReturnThis();
    sharpWebpMock.mockReturnThis();
    sharpMock.mockImplementation(() => ({
      resize: sharpResizeMock,
      webp: sharpWebpMock,
      toBuffer: sharpToBufferMock,
    }));
  });

  // -------------------------------------------------------------------------
  // getMaintenancePhotoUploadUrl
  // -------------------------------------------------------------------------

  describe('getMaintenancePhotoUploadUrl', () => {
    it('returns uploadUrl and storagePath', async () => {
      createPresignedUploadUrlMock.mockResolvedValue({ signedUrl: 'https://example.com/upload' });

      const result = await getMaintenancePhotoUploadUrl(42, 1, 'photo.jpg');

      expect(result.uploadUrl).toBe('https://example.com/upload');
      // storagePath: maintenance/42/1/{timestamp}_photo.jpg
      expect(result.storagePath).toMatch(/^maintenance\/42\/1\/\d+_photo\.jpg$/);
    });

    it("uses 'pre-upload' folder when requestId is null", async () => {
      createPresignedUploadUrlMock.mockResolvedValue({ signedUrl: 'https://example.com/upload' });

      const result = await getMaintenancePhotoUploadUrl(42, null, 'photo.jpg');

      expect(result.storagePath).toMatch(/^maintenance\/42\/pre-upload\//);
    });

    it('sanitizes filename and uses the sanitized name in storagePath', async () => {
      createPresignedUploadUrlMock.mockResolvedValue({ signedUrl: 'https://example.com/upload' });
      sanitizeFilenameMock.mockReturnValue('safe-photo.jpg');

      const result = await getMaintenancePhotoUploadUrl(42, 1, 'bad name!.jpg');

      expect(sanitizeFilenameMock).toHaveBeenCalledWith('bad name!.jpg');
      expect(result.storagePath).toMatch(/safe-photo\.jpg$/);
    });

    it('passes upsert: false to createPresignedUploadUrl', async () => {
      createPresignedUploadUrlMock.mockResolvedValue({ signedUrl: 'https://example.com/upload' });

      await getMaintenancePhotoUploadUrl(42, 1, 'photo.jpg');

      expect(createPresignedUploadUrlMock).toHaveBeenCalledWith(
        'maintenance',
        expect.any(String),
        { upsert: false },
      );
    });
  });

  // -------------------------------------------------------------------------
  // processAndStoreThumbnail
  // -------------------------------------------------------------------------

  describe('processAndStoreThumbnail', () => {
    it('returns thumbnailUrl on success', async () => {
      createPresignedDownloadUrlMock
        // First call: raw image download URL
        .mockResolvedValueOnce('https://example.com/raw-image')
        // Second call: thumb download URL
        .mockResolvedValueOnce('https://example.com/thumb');

      createPresignedUploadUrlMock.mockResolvedValue({
        signedUrl: 'https://example.com/thumb-upload',
      });

      fileTypeFromBufferMock.mockResolvedValue({ mime: 'image/jpeg' });

      mockFetch(
        // First fetch: download the raw image
        { ok: true, arrayBuffer: makeArrayBuffer('fake-image-bytes') },
        // Second fetch: PUT thumbnail upload
        { ok: true },
      );

      const result = await processAndStoreThumbnail(
        'maintenance/42/1/1234567890_photo.jpg',
        42,
        1,
      );

      expect(result).not.toBeNull();
      expect(result?.thumbnailUrl).toBe('https://example.com/thumb');
    });

    it('returns null for a disallowed MIME type', async () => {
      createPresignedDownloadUrlMock.mockResolvedValue('https://example.com/raw-image');
      fileTypeFromBufferMock.mockResolvedValue({ mime: 'application/pdf' });

      mockFetch({ ok: true, arrayBuffer: makeArrayBuffer('pdf-bytes') });

      const result = await processAndStoreThumbnail(
        'maintenance/42/1/1234567890_document.pdf',
        42,
        1,
      );

      expect(result).toBeNull();
    });

    it('returns null when fileTypeFromBuffer returns null (unrecognized file)', async () => {
      createPresignedDownloadUrlMock.mockResolvedValue('https://example.com/raw-image');
      fileTypeFromBufferMock.mockResolvedValue(null);

      mockFetch({ ok: true, arrayBuffer: makeArrayBuffer('garbage') });

      const result = await processAndStoreThumbnail(
        'maintenance/42/1/1234567890_unknown',
        42,
        1,
      );

      expect(result).toBeNull();
    });

    it('returns null when fetch returns a non-ok response', async () => {
      createPresignedDownloadUrlMock.mockResolvedValue('https://example.com/raw-image');

      mockFetch({ ok: false });

      const result = await processAndStoreThumbnail(
        'maintenance/42/1/1234567890_photo.jpg',
        42,
        1,
      );

      expect(result).toBeNull();
    });

    it('returns null when sharp throws during processing', async () => {
      createPresignedDownloadUrlMock.mockResolvedValue('https://example.com/raw-image');
      fileTypeFromBufferMock.mockResolvedValue({ mime: 'image/jpeg' });

      mockFetch({ ok: true, arrayBuffer: makeArrayBuffer('fake-image-bytes') });

      sharpToBufferMock.mockRejectedValue(new Error('sharp processing failed'));

      const result = await processAndStoreThumbnail(
        'maintenance/42/1/1234567890_photo.jpg',
        42,
        1,
      );

      expect(result).toBeNull();
    });

    it('returns null when createPresignedDownloadUrl throws', async () => {
      createPresignedDownloadUrlMock.mockRejectedValue(new Error('storage unavailable'));

      const result = await processAndStoreThumbnail(
        'maintenance/42/1/1234567890_photo.jpg',
        42,
        1,
      );

      expect(result).toBeNull();
    });

    it('uploads thumbnail to the correct path: maintenance/{communityId}/{requestId}/thumb_{basename}.webp', async () => {
      createPresignedDownloadUrlMock
        .mockResolvedValueOnce('https://example.com/raw-image')
        .mockResolvedValueOnce('https://example.com/thumb');

      createPresignedUploadUrlMock.mockResolvedValue({
        signedUrl: 'https://example.com/thumb-upload',
      });

      fileTypeFromBufferMock.mockResolvedValue({ mime: 'image/png' });

      mockFetch(
        { ok: true, arrayBuffer: makeArrayBuffer('fake-image-bytes') },
        { ok: true },
      );

      const storagePath = 'maintenance/42/7/1234567890_photo.jpg';
      await processAndStoreThumbnail(storagePath, 42, 7);

      // The thumb upload should use: maintenance/42/7/thumb_1234567890_photo.jpg.webp
      expect(createPresignedUploadUrlMock).toHaveBeenCalledWith(
        'maintenance',
        'maintenance/42/7/thumb_1234567890_photo.jpg.webp',
        { upsert: true },
      );
    });
  });
});
