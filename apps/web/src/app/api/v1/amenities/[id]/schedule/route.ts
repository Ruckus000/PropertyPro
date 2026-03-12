import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireAmenitiesEnabled,
  requireAmenitiesReadPermission,
} from '@/lib/work-orders/common';
import { getAmenityScheduleForCommunity } from '@/lib/services/work-orders-service';

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const amenityId = parsePositiveInt(params?.id ?? '', 'amenity id');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    requireAmenitiesReadPermission(membership);

    const data = await getAmenityScheduleForCommunity(communityId, amenityId);
    return NextResponse.json({ data });
  },
);
