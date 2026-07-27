'use client';

/**
 * React Query hooks for the Phase 8 site-settings endpoint.
 *
 * `/api/v1/pm/site/settings` — GET / PATCH, plus the three-step favicon upload.
 *
 * Goes through `requestJson` (Plan B6) rather than raw `fetch`: it unwraps the
 * canonical `{ data: T }` envelope and turns a non-2xx into an Error carrying
 * the server's own message. The panel surfaces that message verbatim, and the
 * refusal worth reading — the over-length 400, measured in code points, which
 * the form's own counter cannot reproduce for astral characters — is
 * server-authored.
 *
 * The favicon upload is orchestrated HERE rather than in the form.
 * `guard:component-api-calls` forbids new components calling `/api/v1`
 * directly, and the three steps have to stay in one place anyway or a failure
 * halfway through has no owner. The bare `fetch` in step 2 is a PUT to a
 * presigned Supabase Storage URL, not an app endpoint — same shape as
 * `use-bulk-documents.ts`.
 *
 * Deliberately NOT wired into the publish invalidation set in
 * `use-publish-site.ts`: settings live on the `communities` row, outside the
 * draft layer, so a publish neither changes nor stales them.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { SiteFooterSettings, SiteSettings } from '@/lib/site-editor/site-settings';

export interface SiteSettingsRecord {
  settings: SiteSettings;
  footer: SiteFooterSettings;
}

/**
 * A patch field. Omit to leave unchanged, `null` to clear.
 *
 * Mirrors the route contract exactly — the three states are distinct there and
 * flattening them here would silently turn "leave it alone" into "clear it".
 */
export interface UpdateSiteSettingsVariables {
  seoTitle?: string | null;
  seoDescription?: string | null;
  searchIndexing?: boolean;
  associationName?: string | null;
  note?: string | null;
  showStatutoryLine?: boolean;
}

export function siteSettingsQueryKey(communityId: number) {
  return ['pm', 'site', 'settings', communityId] as const;
}

/**
 * `initialData` comes from the page's server render, so the panel shows real
 * values on first paint instead of a spinner.
 */
export function useSiteSettings(communityId: number, initialData?: SiteSettingsRecord) {
  return useQuery<SiteSettingsRecord>({
    queryKey: siteSettingsQueryKey(communityId),
    queryFn: () =>
      requestJson<SiteSettingsRecord>(`/api/v1/pm/site/settings?communityId=${communityId}`),
    ...(initialData !== undefined ? { initialData } : {}),
  });
}

export function useUpdateSiteSettings(communityId: number) {
  const qc = useQueryClient();
  return useMutation<SiteSettingsRecord, Error, UpdateSiteSettingsVariables>({
    mutationFn: (patch) =>
      requestJson<SiteSettingsRecord>('/api/v1/pm/site/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...patch }),
      }),
    onSuccess: (record) => {
      // Write straight into the cache: the response already carries the
      // authoritative record, so a refetch would only add a round trip and a
      // flicker.
      qc.setQueryData(siteSettingsQueryKey(communityId), record);
    },
  });
}

interface PresignResponse {
  uploadUrl: string;
  token: string;
  storagePath: string;
  expiresAt: string;
}

/**
 * Presign → PUT the bytes → finalize.
 *
 * The finalize step records the result in branding itself, so there is no
 * fourth request and no window where the bytes exist but nothing references
 * them.
 */
export function useUploadFavicon(communityId: number) {
  const qc = useQueryClient();
  return useMutation<SiteSettings['favicon'], Error, File>({
    mutationFn: async (file) => {
      const presign = await requestJson<PresignResponse>('/api/v1/site/uploads/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId,
          kind: 'favicon',
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });

      // Not an /api/v1 call — a direct PUT to Supabase Storage's presigned URL,
      // so `requestJson` (which expects the app's envelope) does not apply.
      const upload = await fetch(presign.uploadUrl, { method: 'PUT', body: file });
      if (!upload.ok) {
        throw new Error("We couldn't upload that image. Please try again.");
      }

      const finalized = await requestJson<{ icon32Path: string; appleTouch180Path: string }>(
        '/api/v1/site/images/finalize-favicon',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, storagePath: presign.storagePath }),
        },
      );
      return finalized;
    },
    onSuccess: (favicon) => {
      // Finalize wrote branding server-side; mirror it locally rather than
      // refetching the whole record for one field.
      qc.setQueryData<SiteSettingsRecord>(siteSettingsQueryKey(communityId), (prev) =>
        prev ? { ...prev, settings: { ...prev.settings, favicon } } : prev,
      );
    },
  });
}
