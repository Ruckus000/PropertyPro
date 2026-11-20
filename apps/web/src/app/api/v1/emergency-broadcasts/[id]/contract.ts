/**
 * Route contract for `GET /api/v1/emergency-broadcasts/[id]`.
 *
 * Managers get the broadcast with its delivery report. Everyone else with
 * read access (owners, board seats included) gets only the message, and only
 * for a broadcast that was sent to them — anything else is 404.
 *
 * Auth surface (handler order after runRoute validates params/query):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'read')
 *     → membership.isAdmin ? getBroadcastWithReport : getBroadcastForRecipient
 *
 * Invalid params/query return 400 before auth.
 *
 * Response: loose `z.unknown()` — two shapes by viewer, both carry `Date` fields.
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
