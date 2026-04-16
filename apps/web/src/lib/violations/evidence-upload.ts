interface PresignResponse {
  data: { path: string; uploadUrl: string; token: string; documentId: string };
}
interface DocumentCreateResponse {
  data: { id: number };
}

/**
 * Client-side helper that uploads a single evidence photo through the violations
 * evidence infrastructure and returns the created document id.
 *
 * Flow:
 *  1. POST /api/v1/upload           → presigned URL + temp document record
 *  2. PUT  <presigned url>          → direct-to-storage upload (bypasses Vercel 4.5MB limit)
 *  3. POST /api/v1/violations/evidence → finalizes hidden evidence metadata
 */
export async function uploadEvidencePhoto(
  communityId: number,
  file: File,
  index: number,
): Promise<number> {
  const presignRes = await fetch('/api/v1/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      communityId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    }),
  });
  if (!presignRes.ok) throw new Error(`Failed to prepare upload for ${file.name}`);
  const presignBody = (await presignRes.json()) as PresignResponse;

  const uploadRes = await fetch(presignBody.data.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!uploadRes.ok) throw new Error(`Failed to upload ${file.name}`);

  const createRes = await fetch('/api/v1/violations/evidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      communityId,
      title: `Violation Evidence Photo ${index + 1}`,
      description: null,
      filePath: presignBody.data.path,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Upload succeeded but saving metadata failed for ${file.name}`);
  }
  const createBody = (await createRes.json()) as DocumentCreateResponse;
  return createBody.data.id;
}
