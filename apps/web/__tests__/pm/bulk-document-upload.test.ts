/**
 * `insertBulkDocumentsForCommunity` writes every row through the same
 * `createUploadedDocument` the single upload uses (measured size and type,
 * audit log), records the redaction attestation before the first row exists, and
 * links the records a batch unambiguously fills (D12) once, after every row is
 * in. Linking is bookkeeping: a failure is reported and the batch still counts
 * as created.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createUploadedDocumentMock,
  recordRedactionAttestationMock,
  autoLinkCommunityRecordsMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  createUploadedDocumentMock: vi.fn(),
  recordRedactionAttestationMock: vi.fn(),
  autoLinkCommunityRecordsMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/documents/create-uploaded-document', () => ({
  createUploadedDocument: createUploadedDocumentMock,
}));

vi.mock('@/lib/documents/redaction-attestation', () => ({
  recordRedactionAttestation: recordRedactionAttestationMock,
}));

vi.mock('@/lib/services/record-auto-link-service', () => ({
  autoLinkCommunityRecords: autoLinkCommunityRecordsMock,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: captureExceptionMock }));

import { insertBulkDocumentsForCommunity } from '../../src/lib/pm/bulk-document-upload';

const MEASURED_A = { byteLength: 1200, mime: 'application/pdf' };
const DOCS = [
  { fileName: '2026 Budget.pdf', storagePath: 'communities/10/documents/u-a/a.pdf', fileSize: 1200, measured: MEASURED_A },
  {
    fileName: 'Bylaws.pdf',
    storagePath: 'communities/10/documents/u-b/b.pdf',
    fileSize: 3400,
    description: 'Amended 2025',
    measured: { byteLength: 3400, mime: 'application/pdf' },
  },
];

function run() {
  return insertBulkDocumentsForCommunity({ communityId: 11, uploadedBy: 'pm-1', docs: DOCS });
}

describe('insertBulkDocumentsForCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordRedactionAttestationMock.mockResolvedValue(undefined);
    createUploadedDocumentMock
      .mockResolvedValueOnce({ document: { id: 501 }, warnings: [] })
      .mockResolvedValueOnce({ document: { id: 502 }, warnings: [] });
    autoLinkCommunityRecordsMock.mockResolvedValue({ linked: 1, ambiguous: 0 });
  });

  it('creates each row through the shared upload path with the route\'s measurement, without resident notifications', async () => {
    const result = await run();

    expect(result).toEqual({ created: 2 });
    expect(createUploadedDocumentMock).toHaveBeenCalledTimes(2);
    expect(createUploadedDocumentMock).toHaveBeenNthCalledWith(1, {
      userId: 'pm-1',
      communityId: 11,
      title: '2026 Budget.pdf',
      description: null,
      filePath: 'communities/10/documents/u-a/a.pdf',
      fileName: '2026 Budget.pdf',
      fileSize: 1200,
      measured: MEASURED_A,
      sourceType: 'library',
      sendDocumentNotifications: false,
      extractText: false,
    });
    expect(createUploadedDocumentMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ description: 'Amended 2025', fileSize: 3400 }),
    );
  });

  it('records an attestation for every document before the first row exists', async () => {
    await run();

    expect(recordRedactionAttestationMock).toHaveBeenCalledTimes(2);
    expect(recordRedactionAttestationMock).toHaveBeenCalledWith({
      communityId: 11,
      categoryId: 0,
      userId: 'pm-1',
      title: 'Bylaws.pdf',
    });
    expect(recordRedactionAttestationMock.mock.invocationCallOrder.at(-1)).toBeLessThan(
      createUploadedDocumentMock.mock.invocationCallOrder[0]!,
    );
  });

  it('links records once, after every row is created, and only with the rows it created', async () => {
    await run();

    expect(autoLinkCommunityRecordsMock).toHaveBeenCalledTimes(1);
    expect(autoLinkCommunityRecordsMock).toHaveBeenCalledWith(11, 'pm-1', { documentIds: [501, 502] });
    expect(createUploadedDocumentMock.mock.invocationCallOrder.at(-1)).toBeLessThan(
      autoLinkCommunityRecordsMock.mock.invocationCallOrder[0]!,
    );
  });

  it('a linking failure does not fail the batch', async () => {
    const failure = new Error('checklist unavailable');
    autoLinkCommunityRecordsMock.mockRejectedValueOnce(failure);

    const result = await run();

    expect(result).toEqual({ created: 2 });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ tags: { record_auto_link: 'bulk_upload' } }),
    );
  });
});
