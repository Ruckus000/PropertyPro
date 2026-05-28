/**
 * Route contract for `GET /api/v1/emergency-broadcasts/[id]`.
 *
 * Plan A1 drain #115. Detail + delivery report. Sibling collection drained in #114.
 *
 * Auth surface (preserved verbatim):
 *   params.id (Zod)
 *     → requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'read')
 *     → getBroadcastWithReport
 *
 * `emergency_broadcasts` IS in `RBAC_RESOURCES`.
 *
 * Response: loose `z.unknown()` — report rows may carry `Date` fields.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const emergencyBroadcastDetailContract = defineRoute({
  method: 'GET',
  path: '/api/v1/emergency-broadcasts/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'emergency_broadcasts', action: 'read' },
});
