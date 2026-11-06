/**
 * `createUploadedDocument` skips its own storage read only when the caller
 * hands in `readValidatedUpload`'s result (the PM bulk route reads each file
 * once for every community). Without it, the read — and its validation — runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createPresignedDownloadUrlMock, insertMock, validateFileMock, queuePdfExtractionMock } = vi.hoisted(() => ({
  createPresignedDownloadUrlMock: vi.fn(),
  insertMock: vi.fn(),
  validateFileMock: vi.fn(),
  queuePdfExtractionMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  createScopedClient: () => ({ insert: insertMock }),
  documents: {},
  logAuditEvent: vi.fn(),
}));
vi.mock('@/lib/utils/file-validation', () => ({ validateFile: validateFileMock }));
vi.mock('@/lib/workers/pdf-extraction', () => ({ queuePdfExtraction: queuePdfExtractionMock }));
vi.mock('@/lib/services/notification-service', () => ({
  createNotificationsForEvent: vi.fn(),
  queueNotificationDetailed: vi.fn(),
}));

import { createUploadedDocument } from '@/lib/documents/create-uploaded-document';

const INPUT = {
  userId: 'pm-1',
  communityId: 11,
  title: 'Budget.pdf',
  filePath: 'communities/10/documents/u-1/budget.pdf',
  fileName: 'Budget.pdf',
  fileSize: 4,
  sourceType: 'library' as const,
  sendDocumentNotifications: false,
};

describe('createUploadedDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    insertMock.mockResolvedValue([{ id: 7, communityId: 11 }]);
    // A read that would succeed, so skipping it is what the first case measures.
    createPresignedDownloadUrlMock.mockResolvedValue('https://storage.test/signed');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]))));
    validateFileMock.mockResolvedValue({ ok: true, type: { mime: 'application/pdf' } });
  });

  it('uses a measurement the caller already took, without reading storage again', async () => {
    await createUploadedDocument({ ...INPUT, measured: { byteLength: 4, mime: 'application/pdf' } });

    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ fileSize: 4, mimeType: 'application/pdf' }),
    );
  });

  it('reads and validates the stored bytes when no measurement is given', async () => {
    await createUploadedDocument(INPUT);

    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith('documents', INPUT.filePath, 300);
    expect(validateFileMock).toHaveBeenCalledTimes(1);
    expect(queuePdfExtractionMock).toHaveBeenCalledTimes(1);
  });

  it('queues no text extraction for a PDF when the caller opts out', async () => {
    await createUploadedDocument({
      ...INPUT,
      measured: { byteLength: 4, mime: 'application/pdf' },
      extractText: false,
    });

    expect(queuePdfExtractionMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith({}, expect.objectContaining({ extractionStatus: 'not_applicable' }));
  });
});
