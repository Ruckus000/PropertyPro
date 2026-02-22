/**
 * Photo processing for maintenance request photo uploads.
 *
 * Uses sharp to generate thumbnails and file-type for magic-byte validation.
 * This module must NEVER be imported in client components — it relies on
 * the `sharp` native module which is server-only.
 *
 * thumbnailUrl is nullable — thumbnail generation is best-effort fire-and-forget.
 */
import { sanitizeFilename } from '@/lib/utils/sanitize-filename';
import { createPresignedDownloadUrl, createPresignedUploadUrl } from '@propertypro/db';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAINTENANCE_BUCKET = 'maintenance';

export interface PhotoEntry {
  url: string;
  thumbnailUrl: string | null; // null until thumbnail generation completes
  storagePath: string;
  uploadedAt: string;
}

/**
 * Generate a presigned upload URL for a maintenance photo.
 * No DB write — caller must attach storagePath to the request record.
 */
export async function getMaintenancePhotoUploadUrl(
  communityId: number,
  requestId: number | null,
  filename: string,
): Promise<{ uploadUrl: string; storagePath: string }> {
  const safeName = sanitizeFilename(filename);
  const folder = requestId != null ? String(requestId) : 'pre-upload';
  const storagePath = `maintenance/${communityId}/${folder}/${Date.now()}_${safeName}`;
  const data = await createPresignedUploadUrl(MAINTENANCE_BUCKET, storagePath, { upsert: false });
  // data.signedUrl is the upload URL (Supabase createSignedUploadUrl response shape)
  return { uploadUrl: data.signedUrl, storagePath };
}

/**
 * Fire-and-forget thumbnail generation.
 * Returns { thumbnailUrl } on success, or null on any failure.
 * Callers MUST handle the null case — thumbnailUrl is nullable in the JSONB shape.
 */
export async function processAndStoreThumbnail(
  storagePath: string,
  communityId: number,
  requestId: number,
): Promise<{ thumbnailUrl: string } | null> {
  try {
    const rawUrl = await createPresignedDownloadUrl(MAINTENANCE_BUCKET, storagePath);
    const res = await fetch(rawUrl);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    const fileType = await fileTypeFromBuffer(bytes);
    if (!fileType || !ALLOWED_MIME_TYPES.has(fileType.mime)) return null;
    const thumbBuffer = await sharp(bytes)
      .resize(300, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const basename = storagePath.split('/').pop() ?? 'photo';
    const thumbPath = `maintenance/${communityId}/${requestId}/thumb_${basename}.webp`;
    const thumbUpload = await createPresignedUploadUrl(MAINTENANCE_BUCKET, thumbPath, { upsert: true });
    await fetch(thumbUpload.signedUrl, { method: 'PUT', body: new Uint8Array(thumbBuffer) });
    const thumbUrl = await createPresignedDownloadUrl(MAINTENANCE_BUCKET, thumbPath);
    return { thumbnailUrl: thumbUrl };
  } catch {
    // Thumbnail generation is best-effort; caller must handle null
    return null;
  }
}
