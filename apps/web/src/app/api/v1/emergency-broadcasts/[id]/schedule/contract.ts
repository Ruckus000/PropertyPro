/**
 * Route contract for `POST /api/v1/emergency-broadcasts/[id]/schedule`.
 *
 * Turns the draft the composer created into a scheduled ("send later") alert,
 * in place. Service is `scheduleBroadcast(broadcastId, communityId, userId,
 * scheduledFor)`, id FIRST like its `cancel` and `send` siblings.
 *
 * Auth surface. `tenantScope: { in: 'body' }` has the runner resolve the
 * community (404 when the `x-community-id` header disagrees with the body)
 * BEFORE the handler runs, so that step precedes the sign-in check here; the
 * rest is the cancel route's chain:
 *   resolveEffectiveCommunityId(req, body.communityId)   [runner]
 *     → requireAuthenticatedUserId
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePermission('emergency_broadcasts', 'write')
 *     → scheduleBroadcast
 *
 * `scheduledFor` is ISO 8601 with an offset or `Z`. The 5-minute to 365-day
 * window is enforced in the service (400 `VALIDATION_ERROR`, field
 * `scheduledFor`), as on create. A draft that has already been sent, scheduled
 * or canceled is 409 `CONFLICT`; an id this community does not have is 404.
 *
 * Response is tight: two keys, and `scheduledFor` is already an ISO string.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const emergencyBroadcastsScheduleContract = defineRoute({
  method: 'POST',
  path: '/api/v1/emergency-broadcasts/[id]/schedule',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      scheduledFor: z.string().datetime({ offset: true }),
    }),
  },
  response: z.object({
    scheduled: z.literal(true),
    scheduledFor: z.string(),
  }),
  tenantScope: { in: 'body' },
  permission: { resource: 'emergency_broadcasts', action: 'write' },
});
