'use client';

/**
 * React Query hooks for the PM content-blocks editor at /pm/settings/website.
 *
 * useContentBlocks      — GET /api/v1/pm/site/blocks?communityId=X
 *                         Returns the ordered list of content blocks for the
 *                         community site, unwrapping the canonical
 *                         { data: { blocks: [...] } } envelope.
 *
 * useUpsertContentBlock — PATCH /api/v1/pm/site/blocks
 *                         Sends { communityId, blockType, blockOrder, content }
 *                         in the body; invalidates the GET query on success so
 *                         the editor reflects the newly-saved state.
 *
 * Both routes use the canonical { data: T } success envelope and
 * { error: { code, message } } error envelope (B1 canonical). Raw fetch is
 * kept to preserve the exact error-literal behaviour; migration to
 * requestJson() is B6 work.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface SiteBlockSummary {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

const blocksKey = (communityId: number) =>
  ['pm', 'site', 'blocks', communityId] as const;

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

export function useContentBlocks(communityId: number) {
  return useQuery<SiteBlockSummary[]>({
    queryKey: blocksKey(communityId),
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/v1/pm/site/blocks?communityId=${communityId}`,
        { signal },
      );
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { data: { blocks: SiteBlockSummary[] } };
      return body.data.blocks;
    },
  });
}

export interface UpsertContentBlockInput {
  blockType: 'text' | 'image' | 'announcements' | 'documents' | 'meetings';
  blockOrder: number;
  content: unknown;
}

export function useUpsertContentBlock(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, UpsertContentBlockInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/pm/site/blocks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: blocksKey(communityId) });
    },
  });
}
