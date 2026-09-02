import { BLOCK_TYPES } from '@propertypro/shared';
import type { UpsertContentBlockInput } from '@/hooks/use-content-blocks';

/**
 * The block types `PATCH /api/v1/pm/site/blocks` accepts, derived from the
 * route contract rather than restated (see `UpsertContentBlockInput`).
 */
export type UpsertableBlockType = UpsertContentBlockInput['blockType'];

/**
 * Narrow a row's `blockType` (typed `string`, because the server may send a
 * type this build has no label for) to something the upsert contract accepts.
 *
 * Returns null for anything the PM must not rewrite through this path: the
 * `hero`, which has its own endpoint, and the `tombstone` sentinel, which is
 * not in `BLOCK_TYPES` at all and would 400.
 *
 * Lives here, and not beside its callers, so `plan-duplicate` and
 * `editor-context` share ONE guard. Putting it in `editor-context.tsx` (where
 * it started, when `toggleHidden` was its only caller) and importing it from
 * `plan-duplicate` would make a cycle — the context imports the planner — and
 * would drag React and the whole editor module graph into the planner's pure
 * unit test. The `UpsertContentBlockInput` import above is `import type`, so
 * this module still pulls in nothing at runtime beyond the shared constant.
 */
export function upsertableBlockType(blockType: string): UpsertableBlockType | null {
  if (blockType === 'hero') return null;
  return (BLOCK_TYPES as readonly string[]).includes(blockType)
    ? (blockType as UpsertableBlockType)
    : null;
}
