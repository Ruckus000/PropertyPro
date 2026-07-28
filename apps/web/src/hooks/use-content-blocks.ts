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
import { TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';
// Both type-only, so neither the contract module nor api-contract enters
// this chunk.
import type { InferBody } from '@propertypro/api-contract';
import type { blocksUpsertContract } from '@/app/api/v1/pm/site/blocks/contract';

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

interface BlocksPayload {
  blocks: SiteBlockSummary[];
  /** The last published state — no drafts, no tombstones. Diffed against `blocks`. */
  publishedBlocks: SiteBlockSummary[];
  /** Authoritative publish token — max published_at over all published rows. */
  latestPublishedAt: string | null;
}

async function fetchBlocks(communityId: number, signal?: AbortSignal): Promise<BlocksPayload> {
  const res = await fetch(`/api/v1/pm/site/blocks?communityId=${communityId}`, { signal });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { data: BlocksPayload };
  return {
    blocks: body.data.blocks,
    publishedBlocks: body.data.publishedBlocks ?? [],
    latestPublishedAt: body.data.latestPublishedAt ?? null,
  };
}

/**
 * The last published state, for the change model. Shares the blocks query key,
 * so it adds no request.
 */
export function usePublishedBlocks(communityId: number) {
  return useQuery<BlocksPayload, Error, SiteBlockSummary[]>({
    queryKey: blocksKey(communityId),
    queryFn: ({ signal }) => fetchBlocks(communityId, signal),
    select: (payload) => payload.publishedBlocks,
  });
}

export function useContentBlocks(communityId: number) {
  // `select` keeps every existing consumer's `.data` a SiteBlockSummary[]
  // while the cached payload also carries the publish token for
  // useSitePublishToken (same queryKey → one fetch, shared cache).
  return useQuery<BlocksPayload, Error, SiteBlockSummary[]>({
    queryKey: blocksKey(communityId),
    queryFn: ({ signal }) => fetchBlocks(communityId, signal),
    select: (payload) => payload.blocks,
  });
}

/**
 * The site's authoritative optimistic-concurrency token (max published_at
 * across ALL published rows, including any shadowed by a draft/tombstone).
 * PublishBar echoes this back on publish rather than deriving it from the
 * merged block list, which would drop shadowed rows and spuriously 409.
 * Shares the blocks query key, so it adds no extra request.
 */
export function useSitePublishToken(communityId: number) {
  return useQuery<BlocksPayload, Error, string | null>({
    queryKey: blocksKey(communityId),
    queryFn: ({ signal }) => fetchBlocks(communityId, signal),
    select: (payload) => payload.latestPublishedAt,
  });
}

export interface UpsertContentBlockInput {
  /**
   * Derived from the route contract rather than restated here.
   *
   * `payments` (Phase 9) made this the FOURTH uncoordinated copy of the block
   * type list — the CHECK constraint, `BLOCK_TYPES`, the contract enum and
   * this one. The CHECK constraint and `BLOCK_TYPES` cannot be linked at
   * compile time, but these two can, so they are. Adding a block type now
   * means touching three places, not four, and this one can no longer drift
   * from the contract that actually validates the request.
   *
   * `import type` only — the contract module is not pulled into the client
   * bundle.
   */
  blockType: InferBody<typeof blocksUpsertContract>['blockType'];
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

export type ReorderBlockInput = {
  /** The winning (merged draft-wins) content-block row id to move. */
  blockId: number;
} & (
  | { direction: 'up' | 'down'; toOrder?: never }
  /** Absolute drop target (drag-and-drop): the block_order slot to land on. */
  | { toOrder: number; direction?: never }
);

/**
 * Pure optimistic-move helper: returns a new block list with the moved block
 * rotated into its new position and the span it crossed shifted to close the
 * gap, order-sorted.
 *
 * Mirrors `reorderSiteBlock` exactly — slot values are re-stamped onto the
 * rotated sequence rather than recomputed, so a sparse ordering stays sparse
 * and the optimistic result matches what the server will return. A one-position
 * `direction` move is the two-element case and reduces to a plain swap.
 *
 * Returns the input unchanged when the block isn't found, has no neighbor in
 * the requested direction, or was dropped where it already sat.
 */
function moveWithin(
  blocks: SiteBlockSummary[],
  input: ReorderBlockInput,
): SiteBlockSummary[] {
  const content = [...blocks]
    // Exclude tombstones (staged deletions) — they're hidden from the editor
    // list and the server's reorderSiteBlock skips them too, so the optimistic
    // move must not treat one as a neighbor (else the visible order desyncs).
    .filter((b) => b.blockOrder >= MIN_CONTENT_BLOCK_ORDER && b.blockType !== TOMBSTONE_BLOCK_TYPE)
    .sort((a, b) => a.blockOrder - b.blockOrder);
  const index = content.findIndex((b) => b.id === input.blockId);
  if (index === -1) return blocks;

  const targetIndex =
    input.direction !== undefined
      ? input.direction === 'up'
        ? index - 1
        : index + 1
      : content.findIndex((b) => b.blockOrder === input.toOrder);
  if (targetIndex < 0 || targetIndex >= content.length || targetIndex === index) {
    return blocks;
  }

  const rotated = [...content];
  const [moving] = rotated.splice(index, 1);
  rotated.splice(targetIndex, 0, moving!);

  // Re-stamp the original slot sequence onto the rotated occupants.
  const slots = content.map((b) => b.blockOrder);
  const nextOrderById = new Map<number, number>();
  rotated.forEach((block, position) => nextOrderById.set(block.id, slots[position]!));

  return blocks
    .map((b) => {
      const nextOrder = nextOrderById.get(b.id);
      return nextOrder === undefined ? b : { ...b, blockOrder: nextOrder };
    })
    .sort((a, b) => a.blockOrder - b.blockOrder);
}

/**
 * Moves a content block via POST /api/v1/pm/site/blocks/reorder — one position
 * (`direction`) or to an absolute slot (`toOrder`, drag-and-drop).
 * Optimistically rotates the affected span in the editor cache so the list
 * reorders instantly, rolls back on error, and invalidates on settle so the
 * canonical server order (and any new draft row ids) replace the optimistic
 * state.
 */
export function useReorderBlocks(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, ReorderBlockInput, { previous?: BlocksPayload }>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/pm/site/blocks/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Send exactly one of direction/toOrder — the contract is `.strict()`
        // with a refine, so an explicit `undefined` sibling would fail it.
        body: JSON.stringify({
          communityId,
          blockId: input.blockId,
          ...(input.direction !== undefined
            ? { direction: input.direction }
            : { toOrder: input.toOrder }),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: blocksKey(communityId) });
      // The cache holds the full BlocksPayload; move within its `blocks` and
      // preserve latestPublishedAt (a reorder never changes the publish token).
      const previous = qc.getQueryData<BlocksPayload>(blocksKey(communityId));
      if (previous) {
        qc.setQueryData<BlocksPayload>(blocksKey(communityId), {
          ...previous,
          blocks: moveWithin(previous.blocks, input),
        });
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
