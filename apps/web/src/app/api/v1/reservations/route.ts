import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  isResidentRole,
  requireAmenitiesEnabled,
  requireAmenitiesReadPermission,
} from '@/lib/work-orders/common';
import {
  listReservationsForActor,
  listReservationsForCommunity,
} from '@/lib/services/work-orders-service';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAmenitiesEnabled(membership);
  await requirePlanFeature(communityId, 'hasAmenities');
  requireAmenitiesReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawPage = searchParams.get('page');
  const rawLimit = searchParams.get('limit');
  const page = rawPage ? parsePositiveInt(rawPage, 'page') : 1;
  const limit = rawLimit ? Math.min(parsePositiveInt(rawLimit, 'limit'), 100) : 20;

  if (isResidentRole(membership.role)) {
    // Residents: reuse the existing actor-scoped helper, paginate client-side.
    const all = await listReservationsForActor(communityId, actorUserId);
    const total = all.length;
    const offset = (page - 1) * limit;
    return NextResponse.json({
      data: {
        data: all.slice(offset, offset + limit),
        meta: { page, limit, total },
      },
    });
  }

  // Admins: server-side paginated community-wide feed.
  const { data, total } = await listReservationsForCommunity(communityId, {
    page,
    limit,
  });

  return NextResponse.json({ data: { data, meta: { page, limit, total } } });
});
