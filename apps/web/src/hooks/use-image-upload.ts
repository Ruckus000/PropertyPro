'use client';

/**
 * React Query mutation hook for uploading site images through the 3-step
 * presign → PUT → finalize pipeline.
 *
 * Step 1: POST /api/v1/site/uploads/presign
 *   Exchanges file metadata for a presigned Supabase Storage PUT URL and a
 *   short-lived upload token. Returns { uploadUrl, token, storagePath, expiresAt }.
 *
 * Step 2: PUT <presign.uploadUrl>
 *   Streams the raw file bytes directly to Supabase Storage using the
 *   presigned URL.  Content-Type is set to the file's MIME type.
 *
 * Step 3: POST /api/v1/site/images/finalize
 *   Triggers server-side resize (1600w + 800w WebP variants) and optional
 *   crop. Returns the canonical storage paths that are written into the
 *   ImageBlock content object by the ImageBlockForm (Task 19).
 *
 * All API calls use the canonical { data: T } success envelope and
 * { error: { code, message } } error envelope (B1 canonical).
 */

import { useMutation } from '@tanstack/react-query';

export interface UseImageUploadOptions {
  communityId: number;
}

export interface ImageUploadInput {
  file: File;
  kind: 'hero' | 'content';
  altText: string;
  cropBox?: { x: number; y: number; width: number; height: number };
}

export interface ImageUploadResult {
  storagePath: string;
  variant1600Path: string;
  variant800Path: string;
  altText: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      errBody.error?.message ?? `Request failed (HTTP ${res.status})`,
    );
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export function useImageUpload({ communityId }: UseImageUploadOptions) {
  return useMutation<ImageUploadResult, Error, ImageUploadInput>({
    mutationFn: async ({ file, kind, altText, cropBox }) => {
      // Step 1: presign
      const presign = await postJson<{
        uploadUrl: string;
        token: string;
        storagePath: string;
        expiresAt: string;
      }>('/api/v1/site/uploads/presign', {
        communityId,
        kind,
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });

      // Step 2: PUT raw bytes to the presigned URL
      const uploadRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type, 'x-upsert': 'false' },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed (HTTP ${uploadRes.status})`);
      }

      // Step 3: finalize (resize + optional crop)
      const finalized = await postJson<{
        variant1600Path: string;
        variant800Path: string;
        altText: string;
      }>('/api/v1/site/images/finalize', {
        communityId,
        storagePath: presign.storagePath,
        altText,
        cropBox,
      });

      return {
        storagePath: presign.storagePath,
        variant1600Path: finalized.variant1600Path,
        variant800Path: finalized.variant800Path,
        altText: finalized.altText,
      };
    },
  });
}
