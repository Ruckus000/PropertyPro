import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createAdminClient: createAdminClientMock,
}));

// Mock pdf-lib to avoid real PDF operations in unit tests
const { mockPdfDoc, mockPage, mockImage } = vi.hoisted(() => {
  const mockImage = { width: 100, height: 50 };
  const mockPage = {
    getSize: vi.fn(() => ({ width: 612, height: 792 })),
    drawImage: vi.fn(),
    drawText: vi.fn(),
  };
  const mockPdfDoc = {
    getPages: vi.fn(() => [mockPage]),
    embedPng: vi.fn(async () => mockImage),
    save: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  return { mockPdfDoc, mockPage, mockImage };
});

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(async () => mockPdfDoc),
  },
}));

import { computeDocumentHash, flattenSignedPdf, uploadSignedDocument } from '../../src/lib/services/esign-pdf-service';
import type { EsignFieldsSchema } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// computeDocumentHash — pure function, no mocking needed
// ---------------------------------------------------------------------------

describe('computeDocumentHash', () => {
  it('produces a deterministic SHA-256 hash (64 hex characters)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const hash1 = computeDocumentHash(bytes);
    const hash2 = computeDocumentHash(bytes);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different input', () => {
    const hash1 = computeDocumentHash(new Uint8Array([1, 2, 3]));
    const hash2 = computeDocumentHash(new Uint8Array([4, 5, 6]));
    expect(hash1).not.toBe(hash2);
  });

  it('returns a lowercase hex string', () => {
    const hash = computeDocumentHash(new Uint8Array([0xff, 0x00, 0xab]));
    expect(hash).toBe(hash.toLowerCase());
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('handles an empty byte array', () => {
    const hash = computeDocumentHash(new Uint8Array([]));
    // SHA-256 of empty input is the well-known constant
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('handles large input', () => {
    const largeInput = new Uint8Array(1_000_000).fill(42);
    const hash = computeDocumentHash(largeInput);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Coordinate translation logic
// ---------------------------------------------------------------------------

describe('coordinate translation logic', () => {
  // The PDF service uses:
  //   pdfX = (field.x / 100) * pageWidth
  //   pdfY = pageHeight - ((field.y / 100) * pageHeight) - fieldHeightPts
  //   fieldWidthPts = (field.width / 100) * pageWidth
  //   fieldHeightPts = (field.height / 100) * pageHeight

  const pageWidth = 612; // US Letter width in points
  const pageHeight = 792; // US Letter height in points

  function translateCoordinates(field: { x: number; y: number; width: number; height: number }) {
    const pdfX = (field.x / 100) * pageWidth;
    const fieldWidthPts = (field.width / 100) * pageWidth;
    const fieldHeightPts = (field.height / 100) * pageHeight;
    const pdfY = pageHeight - ((field.y / 100) * pageHeight) - fieldHeightPts;
    return { pdfX, pdfY, fieldWidthPts, fieldHeightPts };
  }

  it('translates origin (0, 0) correctly', () => {
    const { pdfX, pdfY, fieldHeightPts } = translateCoordinates({
      x: 0, y: 0, width: 10, height: 5,
    });

    expect(pdfX).toBe(0);
    // Y should be near top of page (origin top-left inverted to bottom-left)
    expect(pdfY).toBe(pageHeight - fieldHeightPts);
  });

  it('translates center position correctly', () => {
    const { pdfX, pdfY, fieldWidthPts, fieldHeightPts } = translateCoordinates({
      x: 50, y: 50, width: 10, height: 5,
    });

    expect(pdfX).toBe(pageWidth / 2);
    expect(pdfY).toBe(pageHeight - (pageHeight / 2) - fieldHeightPts);
    expect(fieldWidthPts).toBe(pageWidth * 0.1);
    expect(fieldHeightPts).toBe(pageHeight * 0.05);
  });

  it('translates bottom-right corner correctly', () => {
    const { pdfX, pdfY } = translateCoordinates({
      x: 90, y: 95, width: 10, height: 5,
    });

    expect(pdfX).toBe(pageWidth * 0.9);
    // At y=95%, height=5% => bottom of field is at 100% of page
    // pdfY = pageHeight - (0.95 * pageHeight) - (0.05 * pageHeight) = 0
    expect(pdfY).toBeCloseTo(0, 5);
  });

  it('Y-axis inverts correctly (higher UI y = lower PDF y)', () => {
    const topField = translateCoordinates({ x: 50, y: 10, width: 10, height: 5 });
    const bottomField = translateCoordinates({ x: 50, y: 80, width: 10, height: 5 });

    // In PDF coordinates, higher Y = higher on page
    // A field at top of page (UI y=10) should have higher PDF Y
    expect(topField.pdfY).toBeGreaterThan(bottomField.pdfY);
  });

  it('full-page field covers entire page', () => {
    const { pdfX, pdfY, fieldWidthPts, fieldHeightPts } = translateCoordinates({
      x: 0, y: 0, width: 100, height: 100,
    });

    expect(pdfX).toBe(0);
    expect(pdfY).toBe(0);
    expect(fieldWidthPts).toBe(pageWidth);
    expect(fieldHeightPts).toBe(pageHeight);
  });
});

// ---------------------------------------------------------------------------
// flattenSignedPdf
// ---------------------------------------------------------------------------

describe('flattenSignedPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up admin client mock for storage download
    const storageMock = {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          data: new Blob([new Uint8Array([1, 2, 3])]),
          error: null,
        })),
      })),
    };
    createAdminClientMock.mockReturnValue({ storage: storageMock });
  });

  const baseSchema: EsignFieldsSchema = {
    version: 1,
    fields: [
      {
        id: 'field-1',
        type: 'text',
        signerRole: 'signer',
        page: 0,
        x: 10,
        y: 20,
        width: 30,
        height: 5,
        required: true,
      },
    ],
    signerRoles: ['signer'],
  };

  it('returns a Uint8Array', async () => {
    const result = await flattenSignedPdf(
      'test/doc.pdf',
      [{ role: 'signer', signed_values: { f1: { fieldId: 'field-1', type: 'text', value: 'Test', signedAt: '2026-01-01' } } }],
      baseSchema,
    );

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('calls drawText for text field values', async () => {
    await flattenSignedPdf(
      'test/doc.pdf',
      [{ role: 'signer', signed_values: { f1: { fieldId: 'field-1', type: 'text', value: 'Hello', signedAt: '2026-01-01' } } }],
      baseSchema,
    );

    expect(mockPage.drawText).toHaveBeenCalled();
    const callArgs = mockPage.drawText.mock.calls[0];
    expect(callArgs[0]).toBe('Hello');
  });

  it('calls drawText for date field values', async () => {
    const schema: EsignFieldsSchema = {
      version: 1,
      fields: [{ id: 'date-1', type: 'date', signerRole: 'signer', page: 0, x: 10, y: 20, width: 30, height: 5, required: true }],
      signerRoles: ['signer'],
    };

    await flattenSignedPdf(
      'test/doc.pdf',
      [{ role: 'signer', signed_values: { d1: { fieldId: 'date-1', type: 'date', value: '2026-03-19', signedAt: '2026-03-19' } } }],
      schema,
    );

    expect(mockPage.drawText).toHaveBeenCalledWith('2026-03-19', expect.any(Object));
  });

  it('calls drawText with checkmark for checked checkbox', async () => {
    const schema: EsignFieldsSchema = {
      version: 1,
      fields: [{ id: 'cb-1', type: 'checkbox', signerRole: 'signer', page: 0, x: 10, y: 20, width: 5, height: 5, required: true }],
      signerRoles: ['signer'],
    };

    await flattenSignedPdf(
      'test/doc.pdf',
      [{ role: 'signer', signed_values: { c1: { fieldId: 'cb-1', type: 'checkbox', value: 'true', signedAt: '2026-01-01' } } }],
      schema,
    );

    // Should draw a checkmark character
    const textCalls = mockPage.drawText.mock.calls;
    expect(textCalls.length).toBeGreaterThan(0);
  });

  it('calls embedPng and drawImage for signature fields with valid base64', async () => {
    // Provide a valid base64 string that atob can decode
    // This is a minimal 1x1 transparent PNG encoded in base64
    const validBase64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const schema: EsignFieldsSchema = {
      version: 1,
      fields: [{ id: 'sig-1', type: 'signature', signerRole: 'signer', page: 0, x: 10, y: 20, width: 30, height: 10, required: true }],
      signerRoles: ['signer'],
    };

    await flattenSignedPdf(
      'test/doc.pdf',
      [{ role: 'signer', signed_values: { s1: { fieldId: 'sig-1', type: 'signature', value: `data:image/png;base64,${validBase64Png}`, signedAt: '2026-01-01' } } }],
      schema,
    );

    expect(mockPdfDoc.embedPng).toHaveBeenCalled();
    expect(mockPage.drawImage).toHaveBeenCalled();
  });

  it('skips fields with no matching signed values', async () => {
    await flattenSignedPdf(
      'test/doc.pdf',
      [{ role: 'signer', signed_values: {} }],
      baseSchema,
    );

    expect(mockPage.drawText).not.toHaveBeenCalled();
    expect(mockPage.drawImage).not.toHaveBeenCalled();
  });

  it('handles signers with null signed_values', async () => {
    await flattenSignedPdf(
      'test/doc.pdf',
      [{ role: 'signer', signed_values: null }],
      baseSchema,
    );

    expect(mockPage.drawText).not.toHaveBeenCalled();
  });

  it('supports signedValues (camelCase) alias', async () => {
    await flattenSignedPdf(
      'test/doc.pdf',
      [{ role: 'signer', signedValues: { f1: { fieldId: 'field-1', type: 'text', value: 'CamelCase', signedAt: '2026-01-01' } } }],
      baseSchema,
    );

    expect(mockPage.drawText).toHaveBeenCalled();
  });

  it('throws on download failure', async () => {
    createAdminClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(async () => ({
            data: null,
            error: { message: 'Not found' },
          })),
        })),
      },
    });

    await expect(
      flattenSignedPdf('missing/doc.pdf', [], baseSchema),
    ).rejects.toThrow('Failed to download source PDF');
  });
});

// ---------------------------------------------------------------------------
// uploadSignedDocument
// ---------------------------------------------------------------------------

describe('uploadSignedDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads to the correct storage path and returns it', async () => {
    const uploadMock = vi.fn(async () => ({ error: null }));
    createAdminClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({ upload: uploadMock })),
      },
    });

    const result = await uploadSignedDocument(42, 99, new Uint8Array([1]), 'signed.pdf');

    expect(result).toBe('communities/42/esign-signed/99/signed.pdf');
    expect(uploadMock).toHaveBeenCalledWith(
      'communities/42/esign-signed/99/signed.pdf',
      expect.any(Uint8Array),
      { contentType: 'application/pdf', upsert: true },
    );
  });

  it('throws on upload failure', async () => {
    createAdminClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async () => ({ error: { message: 'Quota exceeded' } })),
        })),
      },
    });

    await expect(
      uploadSignedDocument(1, 1, new Uint8Array([1]), 'test.pdf'),
    ).rejects.toThrow('Failed to upload signed document: Quota exceeded');
  });
});
