'use client';

/**
 * React Query hooks for the PM hero-block editor at /pm/settings/website.
 *
 * useHeroBlock    — GET /api/v1/pm/site/hero?communityId=X
 *                   Returns the current published HeroBlockContent, or null
 *                   when no hero block has been saved yet.
 *
 * useUpdateHeroBlock — PATCH /api/v1/pm/site/hero
 *                      Sends { communityId, ...heroFields } in the body,
 *                      invalidates the GET query on success so the form
 *                      reflects the newly-saved state.
 *
 * Both routes use the canonical { data: T } success envelope and
 * { error: { code, message } } error envelope (B1 canonical). Raw fetch is
 * kept to preserve the exact error-literal behaviour; migration to
 * requestJson() is B6 work.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HeroBlockContent } from '@propertypro/shared';

const heroQueryKey = (communityId: number) =>
  ['pm', 'site', 'hero', communityId] as const;

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

export function useHeroBlock(communityId: number) {
  return useQuery<HeroBlockContent | null>({
    queryKey: heroQueryKey(communityId),
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/v1/pm/site/hero?communityId=${communityId}`,
        { signal },
      );
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      const body = (await res.json()) as {
        data: { hero: HeroBlockContent | null };
      };
      return body.data.hero;
    },
  });
}

export function useUpdateHeroBlock(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, HeroBlockContent>({
    mutationFn: async (content) => {
      const res = await fetch('/api/v1/pm/site/hero', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...content }),
      });
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
    },
    onSuccess: async () => {
      // Invalidate the whole ['pm','site'] subtree, not just the hero query.
      //
      // The hero is block_order 1 of the community's site, so a hero write
      // changes the SAME rows the canvas, the change count and the publish
      // gate read through ['pm','site','blocks', communityId]. Invalidating
      // only ['pm','site','hero'] left every one of those stale: the save
      // succeeded and nothing on screen moved. Matches `useDiscardDrafts`,
      // which invalidates at the same prefix for the same reason.
      await qc.invalidateQueries({ queryKey: ['pm', 'site'] });
    },
  });
}
