'use client';

/**
 * React Query hooks for the Phase 7 urgent notice endpoint.
 *
 * `/api/v1/pm/site/urgent-notice` — GET / POST / DELETE.
 *
 * Goes through `requestJson` (Plan B6) rather than raw `fetch`: it unwraps the
 * canonical `{ data: T }` envelope and turns a non-2xx into an Error carrying
 * the server's own message. That matters here — the panel surfaces that message
 * verbatim, and the two refusals worth reading (409 "publish your website
 * first", 400 over-length) are both server-authored.
 *
 * Deliberately NOT wired into the publish invalidation set in
 * `use-publish-site.ts`: the notice bypasses the draft layer entirely, so a
 * publish neither posts nor clears it and there is nothing to refetch.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

/** Wire shape — timestamps are ISO strings by the time they reach the client. */
export interface UrgentNotice {
  text: string;
  expiresAt: string | null;
  setAt: string | null;
}

export interface SetUrgentNoticeVariables {
  text: string;
  /** ISO 8601, or null for "until I remove it". */
  expiresAt: string | null;
}

export function urgentNoticeQueryKey(communityId: number) {
  return ['pm', 'site', 'urgent-notice', communityId] as const;
}

/**
 * The stored notice, expired or not.
 *
 * `initialData` comes from the page's server render, so the panel shows the
 * current state on first paint instead of a spinner — which matters for a tool
 * whose whole purpose is speed under pressure.
 */
export function useUrgentNotice(communityId: number, initialData?: UrgentNotice | null) {
  return useQuery<UrgentNotice | null>({
    queryKey: urgentNoticeQueryKey(communityId),
    queryFn: async () => {
      const data = await requestJson<{ urgentNotice: UrgentNotice | null }>(
        `/api/v1/pm/site/urgent-notice?communityId=${communityId}`,
      );
      return data.urgentNotice;
    },
    ...(initialData !== undefined ? { initialData } : {}),
  });
}

export function useSetUrgentNotice(communityId: number) {
  const qc = useQueryClient();
  return useMutation<UrgentNotice | null, Error, SetUrgentNoticeVariables>({
    mutationFn: async ({ text, expiresAt }) => {
      const data = await requestJson<{ urgentNotice: UrgentNotice | null }>(
        '/api/v1/pm/site/urgent-notice',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, text, expiresAt }),
        },
      );
      return data.urgentNotice;
    },
    onSuccess: (notice) => {
      // Write straight into the cache rather than invalidating: the response
      // already carries the authoritative record, and a refetch would show a
      // brief empty state on the one surface where that reads as "did it work?"
      qc.setQueryData(urgentNoticeQueryKey(communityId), notice);
    },
  });
}

export function useClearUrgentNotice(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await requestJson<{ ok: true }>(
        `/api/v1/pm/site/urgent-notice?communityId=${communityId}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: () => {
      qc.setQueryData(urgentNoticeQueryKey(communityId), null);
    },
  });
}
