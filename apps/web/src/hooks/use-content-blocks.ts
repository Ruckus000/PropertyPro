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
 * useDeleteContentBlock — DELETE /api/v1/pm/site/blocks (slice 8f)
 *                         Removes the section at blockOrder. Published
 *                         sections are staged as a tombstone draft (removed on
 *                         next publish); draft-only sections vanish
 *                         immediately. Resolves { staged } so callers can pick
 *                         the right toast copy.
 *
 * useDiscardDrafts      — DELETE /api/v1/pm/site/drafts (slice 8f)
 *                         Discards every pending draft (edits, reorders, and
 *                         staged deletions). Invalidates the whole
 *                         ['pm','site'] prefix — a discard can drop the hero
 *                         draft too, which lives under its own query key.
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
  /** PR #8e — true when this row is an unpublished draft. */
  isDraft: boolean;
  /** PR #8e — last publish timestamp (ISO string) or null for drafts. */
  publishedAt: string | null;
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
  blockType:
    | 'text'
    | 'image'
    | 'announcements'
    | 'documents'
    | 'meetings'
    | 'contact'
    | 'faq'
    | 'gallery'
    | 'amenities';
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

export interface DeleteContentBlockResult {
  /**
   * true — the section is live; removal was staged and applies on the next
   * publish. false — the section was an unpublished draft, gone immediately.
   */
  staged: boolean;
}

export function useDeleteContentBlock(communityId: number) {
  const qc = useQueryClient();
  return useMutation<DeleteContentBlockResult, Error, { blockOrder: number }>({
    mutationFn: async ({ blockOrder }) => {
      const res = await fetch('/api/v1/pm/site/blocks', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, blockOrder }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { data: { ok: true; staged: boolean } };
      return { staged: body.data.staged };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: blocksKey(communityId) });
    },
  });
}

export interface DiscardDraftsResult {
  discardedCount: number;
}

export function useDiscardDrafts(communityId: number) {
  const qc = useQueryClient();
  return useMutation<DiscardDraftsResult, Error, void>({
    mutationFn: async () => {
      const res = await fetch('/api/v1/pm/site/drafts', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { data: { ok: true; discardedCount: number } };
      return { discardedCount: body.data.discardedCount };
    },
    onSuccess: async () => {
      // Broad prefix on purpose: a discard can drop the hero draft
      // (['pm','site','hero',id]) as well as the content blocks.
      await qc.invalidateQueries({ queryKey: ['pm', 'site'] });
    },
  });
}

/**
 * Content blocks occupy block_order 2..99; the hero is reserved at order 1
 * and is not reorderable. Mirrors the server-side MIN_CONTENT_BLOCK_ORDER.
 */
const MIN_CONTENT_BLOCK_ORDER = 2;

export interface ReorderBlockInput {
  /** The winning (merged draft-wins) content-block row id to move. */
  blockId: number;
  direction: 'up' | 'down';
}

/**
 * Pure optimistic-swap helper: returns a new block list with the moved block's
 * `blockOrder` swapped with its adjacent content block, order-sorted. The hero
 * (order 1) is excluded from the swap. Returns the input unchanged when the
 * block isn't found or has no neighbor in the requested direction.
 */
function swapAdjacent(
  blocks: SiteBlockSummary[],
  blockId: number,
  direction: 'up' | 'down',
): SiteBlockSummary[] {
  const content = [...blocks]
    .filter((b) => b.blockOrder >= MIN_CONTENT_BLOCK_ORDER)
    .sort((a, b) => a.blockOrder - b.blockOrder);
  const index = content.findIndex((b) => b.id === blockId);
  if (index === -1) return blocks;
  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= content.length) return blocks;

  const moving = content[index]!;
  const neighbor = content[neighborIndex]!;
  return blocks
    .map((b) => {
      if (b.id === moving.id) return { ...b, blockOrder: neighbor.blockOrder };
      if (b.id === neighbor.id) return { ...b, blockOrder: moving.blockOrder };
      return b;
    })
    .sort((a, b) => a.blockOrder - b.blockOrder);
}

/**
 * Moves a content block up/down one position via
 * POST /api/v1/pm/site/blocks/reorder. Optimistically swaps the two blocks in
 * the editor cache so the list reorders instantly, rolls back on error, and
 * invalidates on settle so the canonical server order (and any new draft row
 * ids) replace the optimistic state.
 */
export function useReorderBlocks(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, ReorderBlockInput, { previous?: SiteBlockSummary[] }>({
    mutationFn: async ({ blockId, direction }) => {
      const res = await fetch('/api/v1/pm/site/blocks/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, blockId, direction }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onMutate: async ({ blockId, direction }) => {
      await qc.cancelQueries({ queryKey: blocksKey(communityId) });
      const previous = qc.getQueryData<SiteBlockSummary[]>(blocksKey(communityId));
      if (previous) {
        qc.setQueryData<SiteBlockSummary[]>(
          blocksKey(communityId),
          swapAdjacent(previous, blockId, direction),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(blocksKey(communityId), context.previous);
      }
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: blocksKey(communityId) });
    },
  });
}
