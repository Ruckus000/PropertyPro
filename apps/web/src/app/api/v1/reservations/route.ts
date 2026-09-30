import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import { BadRequestError } from '@/lib/api/errors';
import {
  isResidentRole,
  requireAmenitiesEnabled,
  requireAmenitiesReadPermission,
} from '@/lib/work-orders/common';
import { listReservationsForCommunity } from '@/lib/services/work-orders-service';
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
    // A page past this makes OFFSET overflow Postgres' bigint (a 500), and no
    // community has a million reservations to page through.
    if (page > 10_000) throw new BadRequestError('page must be at most 10000');

    // Residents see only their own reservations. The window is applied in
    // SQL (LIMIT/OFFSET + COUNT) on both branches — this used to fetch every
    // reservation the resident ever made and `.slice()` it in JS (PAG-03).
    const { data, total } = await listReservationsForCommunity(
      communityId,
      isResidentRole(membership.role)
        ? { page, limit, userId: actorUserId }
        : { page, limit },
    );

    return { data, meta: { page, limit, total } };
  }),
);
