import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireAmenitiesEnabled,
  requireAmenitiesReadPermission,
} from '@/lib/work-orders/common';
import { listReservationsForActor } from '@/lib/services/work-orders-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAmenitiesEnabled(membership);
  requireAmenitiesReadPermission(membership);

  const data = await listReservationsForActor(communityId, actorUserId);
  return NextResponse.json({ data });
});
