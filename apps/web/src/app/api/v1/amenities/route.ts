import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireAmenityAdminWrite,
  requireAmenitiesEnabled,
  requireAmenitiesReadPermission,
  requireAmenitiesWritePermission,
} from '@/lib/work-orders/common';
import { createAmenityForCommunity, paginateAmenitiesForCommunity } from '@/lib/services/work-orders-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  amenitiesCreateContract,
  amenitiesListContract,
  createAmenitySchema,
  listAmenitiesQuerySchema,
} from './contract';
export const GET = withErrorHandler(
  runRoute(amenitiesListContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesReadPermission(membership);

    const { searchParams } = new URL(req.url);
    const parsedQuery = listAmenitiesQuerySchema.safeParse({
      cursor: searchParams.get('cursor') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });

    if (!parsedQuery.success) {
      throw new ValidationError('Invalid amenities query', {
        fields: formatZodErrors(parsedQuery.error),
      });
    }

    return paginateAmenitiesForCommunity(communityId, {
      cursor: parsedQuery.data.cursor,
      pageSize: parsedQuery.data.pageSize,
    });
  }),
);

export const POST = withErrorHandler(
  runRoute(amenitiesCreateContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = createAmenitySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid amenity payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesWritePermission(membership);
    requireAmenityAdminWrite(membership);

    return createAmenityForCommunity(
      communityId,
      actorUserId,
      {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        location: parsed.data.location ?? null,
        capacity: parsed.data.capacity ?? null,
        isBookable: parsed.data.isBookable,
        bookingRules: parsed.data.bookingRules,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
