'use client';

/**
 * Hooks for bulk document upload flow used by
 * components/pm/BulkDocumentDialog (B5 batch 27 drain).
 *
 * Documented exception to the requestJson rule: the component throws bespoke
 * per-file literals built from `file.name` ('Failed to prepare upload for
 * <name>') for each presign in the loop, and the bulk-create path parses
 * `{ error: { message } }` with the bespoke fallback literal
 * 'Failed to create bulk documents'. Raw fetch preserves the file-name
 * interpolation + bespoke literals byte-for-byte.
 *
 * The S3-style PUT to the presigned uploadUrl is NOT an /api/v1 call and
 * remains in the component — only the two /api/v1 calls are drained here.
 */
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Presign upload
// ---------------------------------------------------------------------------

export interface PresignUploadInput {
  communityId: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface PresignUploadResult {
  path: string;
  uploadUrl: string;
}

export function usePresignDocumentUpload(): UseMutationResult<
  PresignUploadResult,
  Error,
  PresignUploadInput
> {
  return useMutation<PresignUploadResult, Error, PresignUploadInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        // Bespoke per-file literal — `input.fileName` is already the display
        // name that matches the file the loop is currently processing.
        throw new Error(`Failed to prepare upload for ${input.fileName}`);
      }
      const body = (await res.json()) as { data: PresignUploadResult };
      return body.data;
    },
  });
}

// ---------------------------------------------------------------------------
// Bulk create documents
// ---------------------------------------------------------------------------

export interface BulkDocResult {
  communityId: number;
  communityName: string;
  status: 'created' | 'failed';
  documentsCreated?: number;
  error?: string;
}

export interface BulkDocumentResponse {
  results: BulkDocResult[];
}

export interface BulkCreateDocumentsInput {
  communityIds: number[];
  documents: Array<{
    fileName: string;
    storagePath: string;
    description: string | null;
  }>;
}

export function useBulkCreateDocuments(): UseMutationResult<
  BulkDocumentResponse,
  Error,
  BulkCreateDocumentsInput
> {
  return useMutation<BulkDocumentResponse, Error, BulkCreateDocumentsInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/pm/bulk/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Failed to create bulk documents');
      }
      return (await res.json()) as BulkDocumentResponse;
    },
  });
}
