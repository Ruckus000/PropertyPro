'use client';

/**
 * React Query hooks for `/api/v1/pm/branding` — the branding fields that are
 * LIVE the moment they save: the square logo, the site logo (wordmark) and the
 * email footer. The site's look is a draft until Publish and lives in
 * `use-site-design` instead.
 *
 * A logo is set by uploading the raw file first (`useUploadLogo`) and sending
 * the returned storage path here; the server resizes it and stores its own
 * copy. `null` removes a logo.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface LiveBranding {
  logoPath: string | null;
  /** Ready to show; signed when the file is private, so it expires. */
  logoUrl: string | null;
  siteLogoPath: string | null;
  siteLogoUrl: string | null;
  customEmailFooter: string | null;
}

export interface SaveLiveBrandingVariables {
  logoStoragePath?: string | null;
  siteLogoStoragePath?: string | null;
  customEmailFooter?: string;
}

export function liveBrandingQueryKey(communityId: number) {
  return ['pm', 'branding', communityId] as const;
}

export function useLiveBranding(communityId: number) {
  return useQuery<LiveBranding>({
    queryKey: liveBrandingQueryKey(communityId),
    queryFn: () => requestJson<LiveBranding>(`/api/v1/pm/branding?communityId=${communityId}`),
  });
}

export function useSaveLiveBranding(communityId: number) {
  const qc = useQueryClient();
  return useMutation<LiveBranding, Error, SaveLiveBrandingVariables>({
    mutationFn: (patch) =>
      requestJson<LiveBranding>('/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...patch }),
      }),
    onSuccess: (record) => {
      qc.setQueryData(liveBrandingQueryKey(communityId), record);
    },
  });
}
