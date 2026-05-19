'use client';

import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

/**
 * Stable query-key factory for an esign template's presigned PDF URL.
 */
export function ESIGN_TEMPLATE_PDF_QUERY_KEY(
  communityId: number,
  templateId: number,
) {
  return ['esign-template-pdf', communityId, templateId] as const;
}

interface UseEsignTemplatePdfUrlArgs {
  communityId: number;
  templateId: number;
  /**
   * The caller is responsible for gating the fetch (e.g. only fetch when the
   * template has a `sourceDocumentPath`). The query also self-guards on
   * `communityId > 0 && templateId > 0`.
   */
  enabled: boolean;
}

/**
 * Fetches the presigned PDF URL for an esign template.
 *
 * Route returns the standard `{ data: { pdfUrl } }` envelope; `requestJson`
 * unwraps `.data`, so the query resolves to `{ pdfUrl: string }`.
 */
export function useEsignTemplatePdfUrl({
  communityId,
  templateId,
  enabled,
}: UseEsignTemplatePdfUrlArgs) {
  return useQuery({
    queryKey: ESIGN_TEMPLATE_PDF_QUERY_KEY(communityId, templateId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        communityId: String(communityId),
      });
      return requestJson<{ pdfUrl: string }>(
        `/api/v1/esign/templates/${templateId}/pdf?${params.toString()}`,
        { method: 'GET', signal },
      );
    },
    enabled: enabled && communityId > 0 && templateId > 0,
  });
}
