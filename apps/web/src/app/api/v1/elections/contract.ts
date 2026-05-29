/**
 * Route contracts for `GET /api/v1/elections`.
 *
 * Plan A1 drain #137. Elections collection list.
 *
 * GET uses `parseCommunityIdFromQuery` in-handler (elections collection pattern).
 * `statuses` CSV filter parsed manually in-handler (preserves split/trim semantics).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/elections',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      limit: z.coerce.number().int().min(1).max(25).optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'read' },
});
