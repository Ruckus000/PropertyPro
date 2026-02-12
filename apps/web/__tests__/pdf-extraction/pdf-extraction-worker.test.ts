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

    expect(updateMock).toHaveBeenCalled();
  });
});
