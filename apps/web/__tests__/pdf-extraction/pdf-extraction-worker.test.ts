import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createPresignedDownloadUrlMock,
  createScopedClientMock,
  updateMock,
  documentsTable,
} = vi.hoisted(() => ({
  createPresignedDownloadUrlMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  updateMock: vi.fn(),
  documentsTable: Symbol('documents'),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  createScopedClient: createScopedClientMock,
  documents: documentsTable,
}));

import { queuePdfExtraction } from '../../src/lib/workers/pdf-extraction';

function makeSimplePdf(text: string): Uint8Array {
  const content = `%PDF-1.4\nBT (${text}) Tj ET\n%%EOF`;
  return new TextEncoder().encode(content);
}

describe('pdf-extraction worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scoped client update
    createScopedClientMock.mockReturnValue({ update: updateMock });
    // Mock storage URL + fetch
    createPresignedDownloadUrlMock.mockResolvedValue('http://example.test/signed');
    updateMock.mockResolvedValue([]);
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
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(updateMock).toHaveBeenCalledWith(
      documentsTable,
      expect.objectContaining({ searchText: 'Hello Worker' }),
      expect.anything(),
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

    expect(updateMock).toHaveBeenCalledWith(
      documentsTable,
      expect.objectContaining({
        extractionStatus: 'completed',
        extractionError: null,
        extractedAt: expect.any(Date),
      }),
      expect.anything(),
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

    // The first createScopedClient call is in the catch block for updating failed status
    expect(createScopedClientMock).toHaveBeenCalledWith(1);
    expect(updateMock).toHaveBeenCalledWith(
      documentsTable,
      expect.objectContaining({
        extractionStatus: 'failed',
        extractionError: expect.stringContaining('Failed to download pdf'),
      }),
      expect.anything(),
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

    expect(updateMock).toHaveBeenCalledWith(
      documentsTable,
      expect.objectContaining({
        extractionStatus: 'skipped',
        extractionError: null,
        extractedAt: expect.any(Date),
      }),
      expect.anything(),
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
    expect(updateMock).toHaveBeenCalled();
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
    expect(updateMock).not.toHaveBeenCalled();
  });
});
