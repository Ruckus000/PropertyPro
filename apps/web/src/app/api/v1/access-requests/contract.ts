/**
 * Route contract for `GET /api/v1/access-requests` (admin paginated list).
 *
 * Auth chain: requireAuthenticatedUserId → resolveEffectiveCommunityId(req,
 * query.communityId) → requireCommunityMembership → requirePermission
 * ('residents', 'write') → paginatePendingAccessRequests.
 *
 * `cursor` and `pageSize` are parsed in the handler from `req.url`, NOT in this
 * schema, so empty-string params (`?cursor=`) count as missing rather than
 * failing `min(1)` / `positive()`. Rows are loose `z.unknown()`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const accessRequestsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/access-requests',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'residents', action: 'write' },
});
