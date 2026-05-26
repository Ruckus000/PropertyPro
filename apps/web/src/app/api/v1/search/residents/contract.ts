/**
 * Route contract for `GET /api/v1/search/residents`.
 *
 * Plan A1 Bundle PR #3, drain #58. Command-palette resident search.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('residents', 'read')   // residents cannot search residents (privacy)
 *     → searchResidentsByTrigram(communityId, q, sanitizedInput, limit)
 *
 * Loose `z.array(z.unknown())` response.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const searchResidentsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search/residents',
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
  permission: { resource: 'residents', action: 'read' },
});
