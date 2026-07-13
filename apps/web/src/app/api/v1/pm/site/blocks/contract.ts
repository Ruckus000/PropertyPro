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
  isDraft: z.boolean(),
  publishedAt: z.string().nullable(),
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

export const blocksDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/pm/site/blocks',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      // Content blocks only — order 1 is the hero, which every layout
      // requires and which therefore cannot be deleted.
      blockOrder: z.number().int().min(2).max(99),
    }),
  },
  response: z.object({
    ok: z.literal(true),
    /**
     * true — the section is published; removal was staged as a draft and
     * takes effect on the next publish. false — the section was an
     * unpublished draft and is gone immediately.
     */
    staged: z.boolean(),
  }),
  permission: { resource: 'settings', action: 'write' },
});

export const blocksUpsertContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/blocks',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      // hero has its own dedicated endpoint at /api/v1/pm/site/hero.
      // faq + amenities + gallery are the Pro+ polish blocks (faq/amenities
      // in PR #10c, gallery in #10d); the handler additionally gates all
      // three on hasSitePolishBlocks (POLISH_BLOCK_TYPES).
      blockType: z.enum([
        'text',
        'image',
        'announcements',
        'documents',
        'meetings',
        'contact',
        'faq',
        'gallery',
        'amenities',
      ]),
      blockOrder: z.number().int().min(2).max(99), // 1 is reserved for the hero block
      content: z.unknown(),
    }),
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
