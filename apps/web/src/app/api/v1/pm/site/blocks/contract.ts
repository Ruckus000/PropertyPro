/**
 * Route contracts for `/api/v1/pm/site/blocks`. Plan A1.
 *
 * Lives in its own file so the hook layer can `import type` from here
 * without dragging Next.js / service code into the client bundle.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const siteBlockSchema = z.object({
  id: z.number(),
  blockType: z.string(),
  blockOrder: z.number(),
  content: z.unknown(),
});

export const blocksListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/blocks',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.object({ blocks: z.array(siteBlockSchema) }),
  permission: { resource: 'settings', action: 'read' },
});

export const blocksUpsertContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/blocks',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      blockType: z.enum(['text', 'image']), // hero has its own dedicated endpoint at /api/v1/pm/site/hero
      blockOrder: z.number().int().min(2).max(99), // 1 is reserved for the hero block
      content: z.unknown(),
    }),
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
