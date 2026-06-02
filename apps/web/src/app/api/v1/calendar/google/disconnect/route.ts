/**
 * Google Calendar Disconnect API
 *
 * DELETE /api/v1/calendar/google/disconnect — revoke an active Google
 * Calendar sync connection for a community.
 *
 * Plan A1 drain #89. See `./contract.ts` for the body/response schemas
 * and the permission/RBAC rationale. Behavior-preserving migration to
 * `runRoute`: auth chain, sync-vs-async invariants, and the wire shape
 * `{ data: { disconnected: boolean } }` are all preserved verbatim.
 *
 * Authorization invariants (preserved verbatim):
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, body.communityId)
 *   → assertNotDemoGrace(communityId)                            (async)
 *   → requireCommunityMembership(communityId, actorUserId)       (async)
 *   → requireCalendarSyncEnabledForMembership(membership)        (SYNC)
 *   → requireCalendarSyncWritePermission(membership)             (SYNC)
 *   → disconnectGoogleCalendar(communityId, actorUserId, requestId)
 *
 * The pre-migration handler called
 * `parseCommunityIdFromBody(req, body.communityId)`, which already
 * delegated to `resolveEffectiveCommunityId` under the hood; the
 * runner expresses that as Zod body validation plus the explicit
 * `resolveEffectiveCommunityId(req, body.communityId)` call here.
 *
 * `requestId = req.headers.get('x-request-id')` is forwarded verbatim,
 * including the `null` value when the header is absent.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  requireCalendarSyncEnabledForMembership,
  requireCalendarSyncWritePermission,
} from '@/lib/calendar/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { disconnectGoogleCalendar } from '@/lib/services/calendar-sync-service';
import { calendarGoogleDisconnectContract } from './contract';

export const DELETE = withErrorHandler(
  runRoute(calendarGoogleDisconnectContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCalendarSyncEnabledForMembership(membership);
    requireCalendarSyncWritePermission(membership);

    return disconnectGoogleCalendar(
      communityId,
      actorUserId,
      req.headers.get('x-request-id'),
    );
  }),
);
