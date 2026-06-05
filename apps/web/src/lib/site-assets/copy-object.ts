import { createPresignedDownloadUrl, createPresignedUploadUrl } from '@propertypro/db';

const COPY_TTL_SECONDS = 60 * 5;

function absolute(raw: string): string {
  if (raw.startsWith('http')) return raw;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error('copyStorageObject: NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  return new URL(raw, base).toString();
}

/**
 * Copy a storage object from one path to another within a bucket by downloading
 * the bytes and re-uploading them (no native Supabase copy exists). Returns the
 * copied byte count. Uses the admin-client-backed presigned helpers, so the
 * caller MUST authorize the operation. Server/node runtime only.
 */
export async function copyStorageObject(
  bucket: string,
  fromPath: string,
  toPath: string,
): Promise<number> {
  const downloadUrl = absolute(await createPresignedDownloadUrl(bucket, fromPath, COPY_TTL_SECONDS));
  const dl = await fetch(downloadUrl);
  if (!dl.ok) {
    throw new Error(`copyStorageObject: failed to download ${bucket}/${fromPath} (HTTP ${dl.status})`);
  }
  const bytes = Buffer.from(await dl.arrayBuffer());

  const upload = await createPresignedUploadUrl(bucket, toPath, { upsert: true });
  const uploadUrl = absolute(upload.signedUrl);
  const up = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array(bytes),
  });
  if (!up.ok) {
    throw new Error(`copyStorageObject: failed to upload ${bucket}/${toPath} (HTTP ${up.status})`);
  }
  return bytes.length;
}
