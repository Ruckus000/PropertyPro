/**
 * Route contract for `POST /api/v1/pm/site/blocks/reorder`. Plan A1.
 *
 * Lives in its own file so the hook layer can `import type` from here without
 * dragging Next.js / service code into the client bundle.
 *
 * Moves a single content block one position up or down by swapping its
 * block_order with the adjacent content block (spec §9 PR #8 — ↑/↓ controls).
 * The move is written to the draft layer; the PM publishes to make it live.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const reorderBlockContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/blocks/reorder',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      // The id of the winning (merged draft-wins) content-block row to move,
      // as surfaced by GET /api/v1/pm/site/blocks. The hero is not reorderable.
      blockId: z.number().int().positive(),
      direction: z.enum(['up', 'down']),
    }),
  },
  response: z.object({
    ok: z.literal(true),
    movedBlockId: z.number(),
    fromOrder: z.number(),
    toOrder: z.number(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
