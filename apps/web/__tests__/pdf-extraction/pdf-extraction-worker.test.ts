import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createPresignedDownloadUrlMock,
  updateDocumentExtractionFailureMock,
  updateDocumentExtractionSuccessMock,
} = vi.hoisted(() => ({
  createPresignedDownloadUrlMock: vi.fn(),
  updateDocumentExtractionFailureMock: vi.fn(),
  updateDocumentExtractionSuccessMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  updateDocumentExtractionFailure: updateDocumentExtractionFailureMock,
  updateDocumentExtractionSuccess: updateDocumentExtractionSuccessMock,
}));

import { queuePdfExtraction } from '../../src/lib/workers/pdf-extraction';

function makeSimplePdf(text: string): Uint8Array {
  const content = `%PDF-1.4\nBT (${text}) Tj ET\n%%EOF`;
  return new TextEncoder().encode(content);
}

describe('pdf-extraction worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock storage URL + fetch
    createPresignedDownloadUrlMock.mockResolvedValue('http://example.test/signed');
    updateDocumentExtractionFailureMock.mockResolvedValue(undefined);
    updateDocumentExtractionSuccessMock.mockResolvedValue(undefined);
  });

  it('downloads, extracts, and updates document text', async () => {
    const pdf = makeSimplePdf('Hello Worker');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(pdf.buffer) }));

    queuePdfExtraction({
      communityId: 42,
      documentId: 99,
      path: 'communities/42/documents/abc/file.pdf',
      mimeType: 'application/pdf',
    });

    // allow the microtask to run
    await new Promise((r) => setTimeout(r, 10));

    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith('documents', 'communities/42/documents/abc/file.pdf', 300);
    expect(updateDocumentExtractionSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        documentId: 99,
        text: 'Hello Worker',
        status: 'completed',
      }),
    );
  });

  it('sets extractionStatus to completed on successful extraction', async () => {
    const pdf = makeSimplePdf('Searchable Content');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(pdf.buffer) }));

    queuePdfExtraction({
      communityId: 42,
      documentId: 99,
      path: 'communities/42/documents/abc/file.pdf',
      mimeType: 'application/pdf',
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(updateDocumentExtractionSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        documentId: 99,
        status: 'completed',
      }),
    );
  });

  it('sets extractionStatus to failed with error message on extraction failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    queuePdfExtraction({
      communityId: 1,
      documentId: 2,
      path: 'communities/1/documents/x/y.pdf',
      mimeType: 'application/pdf',
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(updateDocumentExtractionFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 1,
        documentId: 2,
        errorMessage: expect.stringContaining('Failed to download pdf'),
      }),
    );
  });

  it('sets extractionStatus to skipped when extraction returns empty text', async () => {
    // Non-PDF magic bytes but with pdf mime type — fallback parser returns empty
    const emptyPdf = new TextEncoder().encode('%PDF-1.4\n%%EOF');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(emptyPdf.buffer) }));

    queuePdfExtraction({
      communityId: 10,
      documentId: 20,
      path: 'communities/10/documents/scanned/scan.pdf',
      mimeType: 'application/pdf',
    });

    // Allow extra time for the async chain (dynamic import attempt of pdf-parse
    // when fallback parser returns empty text triggers the slower code path)
    await new Promise((r) => setTimeout(r, 200));

    expect(updateDocumentExtractionSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 10,
        documentId: 20,
        status: 'skipped',
      }),
    );
  });

  it('swallows errors and does not throw when corrupt', async () => {
    const junk = new TextEncoder().encode('not-a-pdf');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(junk.buffer) }));

    expect(() =>
      queuePdfExtraction({
        communityId: 1,
        documentId: 2,
        path: 'communities/1/documents/x/y.pdf',
        mimeType: 'application/pdf',
      }),
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 10));

    // Should have been called — either for skipped (empty text) or completed
    expect(updateDocumentExtractionSuccessMock).toHaveBeenCalled();
  });

  it('skips extraction for non-PDF mime types', async () => {
    queuePdfExtraction({
      communityId: 1,
      documentId: 2,
      path: 'communities/1/documents/x/photo.jpg',
      mimeType: 'image/jpeg',
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
    expect(updateDocumentExtractionSuccessMock).not.toHaveBeenCalled();
    expect(updateDocumentExtractionFailureMock).not.toHaveBeenCalled();
  });
});
