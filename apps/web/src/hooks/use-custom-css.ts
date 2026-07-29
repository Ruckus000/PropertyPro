'use client';

/**
 * Pro+ custom-styling overrides: the read seam the Colours panel mounts from,
 * and the focused mutation that writes them.
 *
 * `useSaveCustomCss` PATCHes ONLY customCssOverrides on /api/v1/pm/branding so it
 * never clobbers the other branding fields (colors/fonts/logo) the full
 * BrandingForm owns. The branding route validates + plan-gates
 * (hasSiteCustomCss) server-side.
 *
 * Raw fetch (not requestJson) to render the thrown `.message` verbatim, matching
 * use-branding-form.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomCssOverrides } from '@propertypro/shared';

export const customCssQueryKey = (communityId: number) =>
  ['pm', 'branding', 'custom-css', communityId] as const;

/**
 * The community's stored overrides, seeded from the server render.
 *
 * This exists so the value survives an unmount. The editor renders only the
 * ACTIVE tool's panel, so switching tabs unmounts the Colours panel entirely;
 * without a cache it would remount and re-seed its `useState` from the original
 * server prop, showing pre-save values and letting the next Save post `null`
 * over the override the manager had just persisted.
 *
 * There is no client GET for branding, and there does not need to be: the page
 * seeds this and `useSaveCustomCss` writes the cache on success, so the entry is
 * always current. `staleTime: Infinity` keeps `queryFn` from ever running.
 */
export function useCustomCssOverrides(
  communityId: number,
  initial: CustomCssOverrides | null,
) {
  return useQuery<CustomCssOverrides | null>({
    queryKey: customCssQueryKey(communityId),
    queryFn: () => initial,
    initialData: initial,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export interface SaveCustomCssInput {
  communityId: number;
  /** The override token set, or null to clear all overrides. */
  customCssOverrides: CustomCssOverrides | null;
}

export function useSaveCustomCss() {
  const qc = useQueryClient();
  return useMutation<void, Error, SaveCustomCssInput>({
    mutationFn: async ({ communityId, customCssOverrides }) => {
      const res = await fetch('/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, customCssOverrides }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Failed to save custom styling');
      }
    },
    // What we just persisted IS the stored state — write it through so a panel
    // that remounts later seeds from the save rather than the page-load prop.
    onSuccess: (_result, { communityId, customCssOverrides }) => {
      qc.setQueryData(customCssQueryKey(communityId), customCssOverrides);
    },
  });
}
