import { isContractValidationError, runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
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
} from './contract';
type RouteLikeHandler = Parameters<typeof withErrorHandler>[0];

function withAmenityValidationMessages(handler: RouteLikeHandler): RouteLikeHandler {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (error) {
      if (isContractValidationError(error)) {
        if (error.source === 'query') {
          throw new ValidationError('Invalid amenities query', {
            fields: error.fields,
          });
        }
        if (error.source === 'body') {
          throw new ValidationError('Invalid amenity payload', {
            fields: error.fields,
          });
        }
      }
      throw error;
    }
  };
}

export const GET = withErrorHandler(
  withAmenityValidationMessages(runRoute(amenitiesListContract, async ({ req, query }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesReadPermission(membership);

    return paginateAmenitiesForCommunity(communityId, {
      cursor: query.cursor,
      pageSize: query.pageSize,
    });
  })),
);

export const POST = withErrorHandler(
  withAmenityValidationMessages(runRoute(amenitiesCreateContract, async ({ req, body }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
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
        name: body.name,
        description: body.description ?? null,
        location: body.location ?? null,
        capacity: body.capacity ?? null,
        isBookable: body.isBookable,
        bookingRules: body.bookingRules,
      },
      req.headers.get('x-request-id'),
    );
  })),
);
