/**
 * Route contracts for `/api/v1/pm/site/hero`. Plan A1.
 *
 * Lives in its own file so the hook layer (`use-hero-block.ts`) can
 * `import type` from here without dragging Next.js / service code into
 * the client bundle.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const heroResponseSchema = z.object({
  hero: z.unknown().nullable(),
});

export const heroBlockGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/hero',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: heroResponseSchema,
  permission: { resource: 'settings', action: 'read' },
});

// PATCH body envelope — communityId in the body alongside hero fields.
// The hero fields are validated by heroBlockSchema; the body schema lifts
// the communityId out and uses passthrough so the runner accepts the
// adjacent hero properties. The handler re-validates with heroBlockSchema.
const heroPatchBodySchema = z
  .object({
    communityId: z.number().int().positive(),
  })
  .passthrough();

export const heroBlockPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/hero',
  request: {
    body: heroPatchBodySchema,
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
