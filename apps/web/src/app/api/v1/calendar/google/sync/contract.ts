/**
 * Route contract for `POST /api/v1/calendar/google/sync`.
 *
 * Plan A1 drain #163. Mirrors drain #162 (`calendar/google/connect`) in the
 * calendar-sync domain.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromBody(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireCalendarSyncEnabledForMembership
 *     → requireCalendarSyncWritePermission
 *     → syncGoogleCalendar(communityId, actorUserId, requestId)
 *
 * `parseCommunityIdFromBody` (not `resolveEffectiveCommunityId`) is preserved
 * from pre-migration (drain #162 connect precedent).
 *
 * Response: tight schema matching `syncGoogleCalendar` return type (string
 * `syncedAt`, no Date objects on the wire).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const calendarGoogleSyncPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/calendar/google/sync',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.object({
    syncedCount: z.number().int().nonnegative(),
    syncedAt: z.string(),
    syncToken: z.string(),
  }),
  permission: { resource: 'calendar_sync', action: 'write' },
});
