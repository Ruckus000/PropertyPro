'use client';

/**
 * The website editor's per-user state (builder v4, Phase 3), backed by
 * GET/PATCH /api/v1/pm/site-editor/preferences.
 *
 * Changes apply optimistically: choosing a mode or ticking a step should not
 * wait for the network. The server's answer then replaces the guess.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { SiteEditorPreferences } from '@/app/api/v1/pm/site-editor/preferences/contract';

export type { SiteEditorPreferences };

export interface SiteEditorPreferencesChange {
  mode?: 'guided' | 'free';
  tourDone?: boolean;
  mark?: 'welcome' | 'photo';
  unmark?: 'welcome' | 'photo';
  visit?: 'design' | 'pages' | 'phone';
}

const URL = '/api/v1/pm/site-editor/preferences';
export const siteEditorPreferencesKey = (communityId: number) =>
  ['pm', 'site-editor', 'preferences', communityId] as const;

export function useSiteEditorPreferences(communityId: number) {
  return useQuery<SiteEditorPreferences>({
    queryKey: siteEditorPreferencesKey(communityId),
    queryFn: ({ signal }) =>
      requestJson<SiteEditorPreferences>(`${URL}?communityId=${communityId}`, { signal }),
    staleTime: Infinity,
  });
}

/** The state `change` would produce, for the optimistic update. */
export function applyPreferencesChange(
  current: SiteEditorPreferences,
  change: SiteEditorPreferencesChange,
): SiteEditorPreferences {
  const marked = current.marked.filter((k) => k !== change.unmark);
  if (change.mark && !marked.includes(change.mark)) marked.push(change.mark);
  const visited = [...current.visited];
  if (change.visit && !visited.includes(change.visit)) visited.push(change.visit);
  return {
    mode: change.mode ?? current.mode,
    tourDone: change.tourDone ?? current.tourDone,
    marked,
    visited,
  };
}

export function useUpdateSiteEditorPreferences(communityId: number) {
  const qc = useQueryClient();
  const key = siteEditorPreferencesKey(communityId);
  return useMutation<
    SiteEditorPreferences,
    Error,
    SiteEditorPreferencesChange,
    { previous: SiteEditorPreferences | undefined }
  >({
    mutationKey: key,
    mutationFn: (change) =>
      requestJson<SiteEditorPreferences>(URL, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...change }),
      }),
    onMutate: async (change) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<SiteEditorPreferences>(key);
      if (previous) qc.setQueryData(key, applyPreferencesChange(previous, change));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    // Refetch once the LAST pending change settles. Writing each response
    // into the cache instead would let a slow earlier response land after a
    // later one and roll the later click back on screen.
    onSettled: () => {
      if (qc.isMutating({ mutationKey: key }) <= 1) void qc.invalidateQueries({ queryKey: key });
    },
  });
}
