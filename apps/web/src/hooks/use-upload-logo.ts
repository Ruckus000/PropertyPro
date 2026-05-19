'use client';

import { useMutation } from '@tanstack/react-query';

/**
 * TanStack-Query mutation hook for the community-logo upload flow. Replaces
 * the module-scope `uploadLogoFile()` helper previously in
 * `apps/web/src/components/onboarding/steps/profile-step.tsx`.
 *
 * Two-leg flow, preserved VERBATIM:
 *  1. `POST /api/v1/upload` — presign request returning
 *     `{ data: { path, uploadUrl } }`.
 *  2. `PUT presignBody.data.uploadUrl` — the upload itself to an EXTERNAL
 *     Supabase signed URL (NOT `/api/v1`), body = the raw File.
 *
 * Mutation-only (no cached query) → no invalidation.
 */

interface PresignResponse {
  data: {
    path: string;
    uploadUrl: string;
  };
}

export interface UploadLogoArgs {
  communityId: number;
  file: File;
}

export function useUploadLogo() {
  return useMutation<string, Error, UploadLogoArgs>({
    mutationFn: async ({ communityId, file }) => {
      // Documented exception to the requestJson rule: exact 'Failed to prepare logo upload' literal must be preserved; second leg PUTs to an external Supabase signed URL
      const presignResponse = await fetch('/api/v1/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          communityId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      if (!presignResponse.ok) {
        throw new Error('Failed to prepare logo upload');
      }

      const presignBody = (await presignResponse.json()) as PresignResponse;

      const uploadResponse = await fetch(presignBody.data.uploadUrl, {
        method: 'PUT',
        headers: {
          'content-type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload logo image');
      }

      return presignBody.data.path;
    },
  });
}
