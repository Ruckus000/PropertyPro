'use client';

import { useMutation } from '@tanstack/react-query';

export interface ExportDataVariables {
  communityId: number;
}

export interface ExportDataResult {
  blob: Blob;
  filename: string;
}

/**
 * Triggers a community data export (GET /api/v1/export).
 *
 * Mutation-only: a single user-triggered fetch that returns a binary ZIP
 * blob. There is no cached query to invalidate. The component owns the
 * DOM/browser side-effects (object-URL lifecycle + `<a download>` click);
 * this hook owns only the data fetch, error parsing, and filename
 * derivation.
 */
export function useExportData() {
  return useMutation<ExportDataResult, Error, ExportDataVariables>({
    mutationFn: async ({ communityId }) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      // Documented exception to the requestJson rule: the response is a
      // binary ZIP blob, not the `{ data }` envelope. We replicate the
      // component's original error-parsing byte-for-byte (including the
      // `Export failed (<status>)` fallback) and return the parsed blob +
      // filename so the caller can do the object-URL/anchor-click dance.
      const res = await fetch(`/api/v1/export?${params.toString()}`);
      if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
          const body = await res.json();
          // API errors have the shape { error: { message: '...' } }
          if (body && body.error && typeof body.error.message === 'string') {
            message = body.error.message;
          }
        } catch (jsonError) {
          // Body is not JSON or doesn't contain a message, use default.
          console.error('Failed to parse error response from export API:', jsonError);
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      let filename = `community-export-${communityId}.zip`;
      if (disposition && disposition.includes('attachment')) {
        const filenameMatch = /filename="([^"]+)"/.exec(disposition);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      return { blob, filename };
    },
  });
}
