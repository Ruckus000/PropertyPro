/**
 * E-sign PDF service — server-side PDF manipulation.
 *
 * Handles: embedding signatures/text into PDFs, computing document hashes,
 * and uploading signed documents to Supabase Storage.
 *
 * Coordinate system: The UI stores field positions as percentages of the
 * pdfjs-dist viewport (CropBox at scale=1). This service translates to
 * absolute points in the PDF's coordinate system (MediaBox, origin at
 * bottom-left, 72 points per inch).
 *
 * Translation formula:
 *   pdfX = (field.x / 100) * page.width
 *   pdfY = page.height - ((field.y / 100) * page.height) - fieldHeightPts
 *   (Y is inverted: PDF origin is bottom-left, UI origin is top-left)
 */
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createAdminClient } from '@propertypro/db';
import type { EsignFieldsSchema, EsignFieldDefinition } from '@propertypro/shared';

interface SignerData {
  role: string;
  signed_values?: Record<string, {
    fieldId: string;
    type: string;
    value: string;
    signedAt: string;
  }> | null;
  signedValues?: Record<string, {
    fieldId: string;
    type: string;
    value: string;
    signedAt: string;
  }> | null;
}

/**
 * Downloads a PDF from Supabase Storage, embeds all signatures and field
 * values, and returns the flattened PDF as a Uint8Array.
 */
export async function flattenSignedPdf(
  sourceDocumentPath: string,
  signers: SignerData[],
  fieldsSchema: EsignFieldsSchema,
): Promise<Uint8Array> {
  const admin = createAdminClient();

  // Download source PDF
  const { data: fileData, error: downloadError } = await admin.storage
    .from('documents')
    .download(sourceDocumentPath);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download source PDF: ${downloadError?.message ?? 'No data returned'}`);
  }

  const sourceBytes = new Uint8Array(await fileData.arrayBuffer());
  const pdfDoc = await PDFDocument.load(sourceBytes);
  const pages = pdfDoc.getPages();

  // Build a map of field values from all signers
  const fieldValues = new Map<string, { type: string; value: string }>();
  for (const signer of signers) {
    const values = signer.signed_values ?? signer.signedValues;
    if (!values) continue;
    for (const [key, val] of Object.entries(values)) {
      fieldValues.set(val.fieldId ?? key, { type: val.type, value: val.value });
    }
  }

  // Embed each field value into the PDF
  for (const field of fieldsSchema.fields) {
    const value = fieldValues.get(field.id);
    if (!value) continue;

    const pageIndex = field.page;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex]!;
    const { width: pageWidth, height: pageHeight } = page.getSize();

    // Translate percentage coordinates to absolute PDF points
    const pdfX = (field.x / 100) * pageWidth;
    const fieldWidthPts = (field.width / 100) * pageWidth;
    const fieldHeightPts = (field.height / 100) * pageHeight;
    // Y is inverted: PDF origin is bottom-left, UI origin is top-left
    const pdfY = pageHeight - ((field.y / 100) * pageHeight) - fieldHeightPts;

    if (value.type === 'signature' || value.type === 'initials') {
      // Embed PNG image
      try {
        const base64Data = value.value.replace(/^data:image\/\w+;base64,/, '');
        const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const image = await pdfDoc.embedPng(imageBytes);

        page.drawImage(image, {
          x: pdfX,
          y: pdfY,
          width: fieldWidthPts,
          height: fieldHeightPts,
        });
      } catch (error) {
        console.error('[esign-pdf] failed to embed signature image', {
          fieldId: field.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (value.type === 'date' || value.type === 'text') {
      // Draw text
      page.drawText(value.value, {
        x: pdfX + 2,
        y: pdfY + fieldHeightPts / 3,
        size: Math.min(fieldHeightPts * 0.6, 12),
      });
    } else if (value.type === 'checkbox') {
      // Use an ASCII-safe mark so pdf-lib's default font can always encode it.
      if (value.value === 'true' || value.value === 'checked') {
        page.drawText('X', {
          x: pdfX + fieldWidthPts / 4,
          y: pdfY + fieldHeightPts / 4,
          size: Math.min(fieldHeightPts * 0.7, 14),
        });
      }
    }
  }

  return pdfDoc.save();
}

/**
 * Computes a SHA-256 hash of the given PDF bytes.
 */
export function computeDocumentHash(pdfBytes: Uint8Array): string {
  return crypto.createHash('sha256').update(pdfBytes).digest('hex');
}

/**
 * Uploads a signed PDF to Supabase Storage and returns the storage path.
 */
export async function uploadSignedDocument(
  communityId: number,
  submissionId: number,
  pdfBytes: Uint8Array,
  fileName: string,
): Promise<string> {
  const admin = createAdminClient();
  const storagePath = `communities/${communityId}/esign-signed/${submissionId}/${fileName}`;

  const { error } = await admin.storage
    .from('documents')
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload signed document: ${error.message}`);
  }

  return storagePath;
}
