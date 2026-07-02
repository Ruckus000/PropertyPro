/**
 * Storage path + content validators for upload-trust boundaries.
 *
 * The e-sign template upload flow uses a presigned URL (direct
 * browser → Supabase Storage). The server only sees a client-asserted
 * mimeType and a caller-supplied `sourceDocumentPath` when the template
 * is created. These helpers close two trust gaps the audit flagged:
 *
 *   1. assertCommunityOwnedStoragePath — the path must point inside
 *      the actor's community prefix. Without this check, a writer in
 *      community A could reference a bucket path under community B
 *      (or any other arbitrary path) and bind it as a template.
 *
 *   2. assertPdfMagicBytes — the actual bytes at the storage path must
 *      start with `%PDF-`. Without this check, a writer can presign as
 *      `application/pdf` and store any bytes — image, malware, HTML —
 *      and the e-sign flow will sign and serve those bytes as PDFs.
 */
import { downloadStorageObject, deleteStorageObject } from '@propertypro/db';
import { ValidationError } from '@/lib/api/errors';

/**
 * Verifies a caller-supplied storage path lives under the active
 * community's prefix in the documents bucket.
 */
export function assertCommunityOwnedStoragePath(
  path: string,
  communityId: number,
  /** Subdirectory under `communities/{id}/` (e.g. `esign-templates`). */
  subdirectory: string,
): void {
  const expectedPrefix = `communities/${communityId}/${subdirectory}/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new ValidationError(
      'Storage path does not belong to this community.',
      {
        fields: {
          sourceDocumentPath: `Path must start with ${expectedPrefix}`,
        },
      },
    );
  }
}

/**
 * Verifies the bytes at a storage path begin with the PDF magic
 * header. Deletes the offending object before throwing so a malicious
 * upload does not linger in storage.
 *
 * The PDF spec mandates the first 5 bytes are `%PDF-` (0x25 0x50 0x44
 * 0x46 0x2D). Any leading whitespace / BOM is technically tolerated by
 * some readers, but real signing flows require strict conformance.
 */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

export async function assertPdfMagicBytes(
  bucket: string,
  path: string,
): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await downloadStorageObject(bucket, path);
  } catch (err) {
    throw new ValidationError(
      `Could not read uploaded file at ${path}: ${(err as Error).message}`,
    );
  }

  if (
    bytes.byteLength < PDF_MAGIC.length ||
    !PDF_MAGIC.every((expected, i) => bytes[i] === expected)
  ) {
    // Best-effort cleanup — failure to delete should not mask the
    // primary validation error from the caller.
    try {
      await deleteStorageObject(bucket, path);
    } catch (cleanupErr) {
      console.error(
        `[storage-validators] Failed to delete invalid upload ${bucket}/${path}:`,
        cleanupErr,
      );
    }
    throw new ValidationError(
      'Uploaded file is not a valid PDF.',
      { fields: { sourceDocumentPath: 'File must be a valid PDF' } },
    );
  }
}
