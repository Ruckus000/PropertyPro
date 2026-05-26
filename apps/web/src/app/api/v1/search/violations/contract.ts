/**
 * Route contract for `GET /api/v1/search/violations`.
 *
 * Plan A1 Bundle PR #3, drain #60. Command-palette violations search.
 *
 * Auth chain preserved verbatim — note `requireViolationsEnabled` is async
 * and gates the feature flag + plan before the RBAC permission check:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → await requireViolationsEnabled(membership)
 *     → requirePermission('violations', 'read')
 *     → searchViolationsByTrigram(communityId, q, limit, { isAdmin, userId })
 *
 * Loose `z.array(z.unknown())` response.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const searchViolationsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search/violations',
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
  permission: { resource: 'violations', action: 'read' },
});
