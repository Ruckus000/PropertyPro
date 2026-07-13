/**
 * Route contract for `/api/v1/pm/site/drafts`. Plan A1.
 *
 * Lives in its own file so the hook layer can `import type` from here
 * without dragging Next.js / service code into the client bundle.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const draftsDiscardContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/pm/site/drafts',
  request: {
    // DELETE-with-body matches the /pm/site/domain DELETE precedent.
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.object({
    ok: z.literal(true),
    /** Number of draft rows discarded (0 when there was nothing pending). */
    discardedCount: z.number(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
