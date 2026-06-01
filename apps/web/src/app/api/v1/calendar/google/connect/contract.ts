/**
 * Route contract for `POST /api/v1/calendar/google/connect`.
 *
 * Plan A1 drain #162. Starts Google Calendar OAuth for a community.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromBody(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireCalendarSyncEnabledForMembership
 *     → requireCalendarSyncWritePermission
 *     → initiateGoogleCalendarConnect
 *
 * `parseCommunityIdFromBody` (not `resolveEffectiveCommunityId`) is preserved
 * from pre-migration (drain #135 esign upload precedent).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const calendarGoogleConnectPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/calendar/google/connect',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.object({
    authorizationUrl: z.string(),
    state: z.string(),
  }),
  permission: { resource: 'calendar_sync', action: 'write' },
});
