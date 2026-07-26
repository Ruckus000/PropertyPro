/**
 * Route contract for `POST /api/v1/pm/site/blocks/reorder`. Plan A1.
 *
 * Lives in its own file so the hook layer can `import type` from here without
 * dragging Next.js / service code into the client bundle.
 *
 * Moves a single content block (spec §9 PR #8 — ↑/↓ controls; v3 Phase 2b-2 —
 * drag-and-drop). The move is written to the draft layer; the PM publishes to
 * make it live.
 *
 * Two mutually exclusive forms:
 *   - `direction` — move one position. The legacy editor's ↑/↓ buttons and the
 *     v3 keyboard grip both use this.
 *   - `toOrder`   — move to an absolute slot. A drag crossing several positions
 *     is a rotation, not a swap, so expressing it as repeated `direction` calls
 *     would need N round-trips and could half-apply.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const reorderBlockContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/blocks/reorder',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        // The id of the winning (merged draft-wins) content-block row to move,
        // as surfaced by GET /api/v1/pm/site/blocks. The hero is not reorderable.
        blockId: z.number().int().positive(),
        direction: z.enum(['up', 'down']).optional(),
        // Content slots only — order 1 is the hero and is not a valid target.
        toOrder: z.number().int().min(2).max(99).optional(),
      })
      .strict()
      .refine(
        (b) => (b.direction === undefined) !== (b.toOrder === undefined),
        { message: 'Provide exactly one of direction or toOrder.' },
      ),
  },
  response: z.object({
    ok: z.literal(true),
    movedBlockId: z.number(),
    fromOrder: z.number(),
    toOrder: z.number(),
    /** True when the section was dropped where it already sat. */
    unchanged: z.boolean(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
