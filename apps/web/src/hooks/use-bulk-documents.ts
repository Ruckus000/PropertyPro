'use client';

/**
 * Hooks for bulk document upload flow used by
 * components/pm/BulkDocumentDialog (originally B5 drain #60).
 *
 * Three exports:
 *   - `usePresignDocumentUpload` — single-file presign mutation (à la carte).
 *   - `useBulkCreateDocuments` — bulk record-create mutation (à la carte).
 *   - `useBulkUploadDocuments` — full orchestrator: loops presign + S3 PUT
 *      per file, then calls bulk-create at the end. Accepts an `onProgress`
 *      callback so the consumer can drive a progress indicator between steps.
 *      Replaces the pre-existing pattern of calling `mutateAsync` inside
 *      another mutation's `mutationFn` (a TanStack anti-pattern).
 *
 * Documented exception to the requestJson rule: the orchestrator throws
 * bespoke per-file literals built from `file.name` ('Failed to prepare
 * upload for <name>' / 'Failed to upload <name>'), and the bulk-create path
 * parses `{ error: { message } }` with the bespoke fallback literal
 * 'Failed to create bulk documents'. Raw fetch preserves the file-name
 * interpolation + bespoke literals byte-for-byte.
 *
 * The S3-style PUT to the presigned uploadUrl is NOT a `/api/v1` call but
 * is still handled inside `useBulkUploadDocuments` because it is part of
 * the bulk-upload flow (so the consumer can use a single mutation).
 */
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Shared types + plain async helpers
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

async function presignSingleUpload(input: PresignUploadInput): Promise<PresignUploadResult> {
  const res = await fetch('/api/v1/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // Bespoke per-file literal — `input.fileName` is the display name.
    throw new Error(`Failed to prepare upload for ${input.fileName}`);
  }
  const body = (await res.json()) as { data: PresignUploadResult };
  return body.data;
}

async function bulkCreateDocuments(input: BulkCreateDocumentsInput): Promise<BulkDocumentResponse> {
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
}

// ---------------------------------------------------------------------------
// Per-call mutation hooks (à la carte)
// ---------------------------------------------------------------------------

export function usePresignDocumentUpload(): UseMutationResult<
  PresignUploadResult,
  Error,
  PresignUploadInput
> {
  return useMutation<PresignUploadResult, Error, PresignUploadInput>({
    mutationFn: presignSingleUpload,
  });
}

export function useBulkCreateDocuments(): UseMutationResult<
  BulkDocumentResponse,
  Error,
  BulkCreateDocumentsInput
> {
  return useMutation<BulkDocumentResponse, Error, BulkCreateDocumentsInput>({
    mutationFn: bulkCreateDocuments,
  });
}

// ---------------------------------------------------------------------------
// Orchestrator hook (full bulk-upload flow)
// ---------------------------------------------------------------------------

export interface BulkUploadDocumentsInput {
  files: File[];
  /**
   * Communities that should receive the new document records (bulk-create
   * destination set).
   */
  communityIds: number[];
  /**
   * Community id used for the presign step. The pre-drain behavior used
   * the first selected community's id for the upload path; callers
   * typically pass `selectedCommunities[0].id` here.
   */
  uploadCommunityId: number;
  description: string | null;
}

export interface UseBulkUploadDocumentsOptions {
  /**
   * Invoked between major steps so the consumer can drive a progress
   * indicator. Called with `'Uploading files...'` before the per-file loop
   * and `'Creating document records...'` before the bulk-create step.
   */
  onProgress?: (message: string) => void;
}

export function useBulkUploadDocuments(
  options?: UseBulkUploadDocumentsOptions,
): UseMutationResult<BulkDocumentResponse, Error, BulkUploadDocumentsInput> {
  return useMutation<BulkDocumentResponse, Error, BulkUploadDocumentsInput>({
    mutationFn: async ({ files, communityIds, uploadCommunityId, description }) => {
      options?.onProgress?.('Uploading files...');
      const uploaded: Array<{ fileName: string; storagePath: string }> = [];

      for (const file of files) {
        const presigned = await presignSingleUpload({
          communityId: uploadCommunityId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });

        const uploadRes = await fetch(presigned.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': file.type },
          body: file,
        });
        if (!uploadRes.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        uploaded.push({ fileName: file.name, storagePath: presigned.path });
      }

      options?.onProgress?.('Creating document records...');
      return await bulkCreateDocuments({
        communityIds,
        documents: uploaded.map((u) => ({
          fileName: u.fileName,
          storagePath: u.storagePath,
          description,
        })),
      });
    },
  });
}
