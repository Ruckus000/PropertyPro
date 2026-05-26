/**
 * Route contract for `GET /api/v1/search/maintenance`.
 *
 * Plan A1 Bundle PR #3, drain #56. Command-palette maintenance ticket search.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('maintenance', 'read')
 *     → searchMaintenanceByTrigram(communityId, q, limit, { isAdmin, userId })
 *
 * Loose `z.array(z.unknown())` response; rows carry typed identifiers.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const searchMaintenanceContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search/maintenance',
  request: {
    query: z.object({
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(20).optional(),
      communityId: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.object({
    results: z.array(z.unknown()),
    totalCount: z.number().int().nonnegative(),
    status: z.literal('ok'),
  }),
  permission: { resource: 'maintenance', action: 'read' },
});
