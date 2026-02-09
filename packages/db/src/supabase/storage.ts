/**
 * Presigned URL helpers for Supabase Storage.
 *
 * AGENTS #9: Use presigned URLs for uploads — Vercel enforces a 4.5MB request body limit.
 * Files should be uploaded directly from the browser to Supabase Storage.
 *
 * @module supabase/storage
 */
import { createAdminClient } from './admin';

/** Default presigned URL expiration: 1 hour (in seconds) */
const DEFAULT_EXPIRES_IN = 3600;

/**
 * Generates a presigned upload URL for direct browser-to-storage uploads.
 *
 * @param bucket  - Storage bucket name
 * @param path    - File path within the bucket
 * @param options - Upload options (upsert, expiration)
 * @returns Presigned upload data (url, token, path)
 */
export async function createPresignedUploadUrl(
  bucket: string,
  path: string,
  options?: { upsert?: boolean },
) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(path, {
      upsert: options?.upsert ?? false,
    });

  if (error) {
    throw new Error(`Failed to create presigned upload URL: ${error.message}`);
  }

  return data;
}

/**
 * Generates a presigned download URL for temporary file access.
 *
 * @param bucket    - Storage bucket name
 * @param path      - File path within the bucket
 * @param expiresIn - URL validity in seconds (default: 1 hour)
 * @returns Presigned download URL string
 */
export async function createPresignedDownloadUrl(
  bucket: string,
  path: string,
  expiresIn: number = DEFAULT_EXPIRES_IN,
) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Failed to create presigned download URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Deletes a file from Supabase Storage.
 *
 * @param bucket - Storage bucket name
 * @param path   - File path within the bucket
 */
export async function deleteStorageObject(bucket: string, path: string) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Failed to delete storage object: ${error.message}`);
  }
}
