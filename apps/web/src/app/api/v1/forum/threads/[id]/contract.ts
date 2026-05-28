/**
 * Route contracts for `GET`, `PATCH`, and `DELETE /api/v1/forum/threads/[id]`.
 *
 * Plan A1 drain #117. Thread detail + moderation mutations. Sibling collection
 * drained in #97.
 *
 * GET/DELETE auth-first: contract omits `communityId` query so invalid/missing
 * `communityId` does not 400 before `requireAuthenticatedUserId` (move-checklists
 * #107 / forum/threads collection #97 precedent). `communityId` parsed in-handler
 * via `parseCommunityIdFromQuery` after auth.
 *
 * PATCH: body fields validated by contract; "at least one field" rule preserved
 * in-handler after auth.
 *
 * DELETE response: tight `z.object({ id, deleted: true })` — synthesized client-side.
 * GET/PATCH response: loose `z.unknown()` — thread/reply rows may carry `Date` fields.
 *
 * `permission` uses `polls` placeholders — effective gates are inline poll/board helpers.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const forumThreadDetailGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/forum/threads/[id]',
  request: {
    params: paramsSchema,
  },
  response: z.unknown(),
  permission: { resource: 'polls', action: 'read' },
});

export const forumThreadUpdateBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240).optional(),
  body: z.string().trim().min(1).max(8000).optional(),
  isPinned: z.boolean().optional(),
  isLocked: z.boolean().optional(),
});

export const forumThreadUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/forum/threads/[id]',
  request: {
    params: paramsSchema,
    body: forumThreadUpdateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'polls', action: 'write' },
});

export const forumThreadDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/forum/threads/[id]',
  request: {
    params: paramsSchema,
  },
  response: z.object({
    id: z.number().int().positive(),
    deleted: z.literal(true),
  }),
  permission: { resource: 'polls', action: 'write' },
});
