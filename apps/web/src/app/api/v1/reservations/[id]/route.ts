/**
 * Reservations — cancel a reservation (DELETE alias).
 *
 * DELETE /api/v1/reservations/[id]?communityId=
 *
 * Plan A1 drain #121. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Behavior matches drain #70 (`POST …/cancel`) — same
 * service call and auth chain; only HTTP method and `communityId` carrier
 * differ (query vs body).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  isResidentRole,
  requireAmenitiesEnabled,
  requireAmenitiesWritePermission,
  requireReservationPermission,
} from '@/lib/work-orders/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { cancelReservationForCommunity } from '@/lib/services/work-orders-service';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { reservationDeleteContract } from './contract';

export const DELETE = withErrorHandler(
  runRoute(reservationDeleteContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesWritePermission(membership);
    requireReservationPermission(membership);

    const canCancelAny = !isResidentRole(membership.role);

    return cancelReservationForCommunity(
      communityId,
      params.id,
      actorUserId,
      canCancelAny,
      req.headers.get('x-request-id'),
    );
  }),
);
