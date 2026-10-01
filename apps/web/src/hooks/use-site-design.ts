'use client';

/**
 * React Query hooks for `/api/v1/pm/site/design` — the site's look (layout,
 * colour set, colours, fonts, custom colours), saved as a draft until Publish.
 *
 * Under the `['pm','site']` prefix on purpose: publish and discard invalidate
 * that prefix, and both change this record (publish promotes the draft,
 * discard drops it).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomCssOverrides, SiteLook } from '@propertypro/shared';
import { requestJson } from '@/lib/api/request-json';

export interface SiteDesignRecord {
  /** What residents see now. */
  live: SiteLook;
  /** Unpublished changes only — empty when there is nothing to publish. */
  draft: SiteLook;
}

export interface SaveSiteDesignVariables {
  layoutId?: string;
  themePresetSlug?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontHeading?: string;
  fontBody?: string;
  /** `null` clears the custom colours. */
  customCssOverrides?: CustomCssOverrides | null;
}

export function siteDesignQueryKey(communityId: number) {
  return ['pm', 'site', 'design', communityId] as const;
}

export function useSiteDesign(communityId: number) {
  return useQuery<SiteDesignRecord>({
    queryKey: siteDesignQueryKey(communityId),
    queryFn: () =>
      requestJson<SiteDesignRecord>(`/api/v1/pm/site/design?communityId=${communityId}`),
  });
}

export function useSaveSiteDesign(communityId: number) {
  const qc = useQueryClient();
  return useMutation<SiteDesignRecord, Error, SaveSiteDesignVariables>({
    mutationFn: (patch) =>
      requestJson<SiteDesignRecord>('/api/v1/pm/site/design', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...patch }),
      }),
    onSuccess: (record) => {
      qc.setQueryData(siteDesignQueryKey(communityId), record);
    },
  });
}
