import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  isResidentRole,
  requireAmenitiesEnabled,
  requireAmenitiesWritePermission,
  requireReservationPermission,
} from '@/lib/work-orders/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { cancelReservationForCommunity } from '@/lib/services/work-orders-service';

export const DELETE = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const reservationId = parsePositiveInt(params?.id ?? '', 'reservation id');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    requireAmenitiesWritePermission(membership);
    requireReservationPermission(membership);

    const canCancelAny = !isResidentRole(membership.role);
    const requestId = req.headers.get('x-request-id');
    const data = await cancelReservationForCommunity(
      communityId,
      reservationId,
      actorUserId,
      canCancelAny,
      requestId,
    );

    return NextResponse.json({ data });
  },
);
