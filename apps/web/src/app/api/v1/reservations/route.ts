import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
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
import { reservationsListContract } from './contract';

export const GET = withErrorHandler(
  runRoute(reservationsListContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { searchParams } = new URL(req.url);
    const rawPage = searchParams.get('page');
    const rawLimit = searchParams.get('limit');
    const page = rawPage ? parsePositiveInt(rawPage, 'page') : 1;
    const limit = rawLimit ? Math.min(parsePositiveInt(rawLimit, 'limit'), 100) : 20;

    if (isResidentRole(membership.role)) {
      const all = await listReservationsForActor(communityId, actorUserId);
      const total = all.length;
      const offset = (page - 1) * limit;
      return {
        data: all.slice(offset, offset + limit),
        meta: { page, limit, total },
      };
    }

    const { data, total } = await listReservationsForCommunity(communityId, {
      page,
      limit,
    });

    return { data, meta: { page, limit, total } };
  }),
);
