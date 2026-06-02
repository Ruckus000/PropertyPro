/**
 * POST /api/v1/calendar/google/connect
 *
 * Plan A1 drain #162. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import {
  requireCalendarSyncEnabledForMembership,
  requireCalendarSyncWritePermission,
} from '@/lib/calendar/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { initiateGoogleCalendarConnect } from '@/lib/services/calendar-sync-service';
import { calendarGoogleConnectPostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(calendarGoogleConnectPostContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCalendarSyncEnabledForMembership(membership);
    requireCalendarSyncWritePermission(membership);

    return initiateGoogleCalendarConnect(communityId, actorUserId);
  }),
);
