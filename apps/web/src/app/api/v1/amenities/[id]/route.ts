/**
 * Amenities — update an amenity.
 *
 * PATCH /api/v1/amenities/[id]
 * Body: { communityId, name?, description?, location?, capacity?, isBookable?, bookingRules? }
 *
 * Plan A1 drain #75. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Mirrors drain #70
 * (reservations/[id]/cancel) — async `requirePlanFeature` gate — but PATCH
 * with a nested `bookingRules` body field and the canonical "OBJECT 4th
 * positional" arg shape passed to the service.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireAmenitiesEnabled (sync, NOT awaited)
 *     → requirePlanFeature(communityId, 'hasAmenities') (async — awaited)
 *     → requireAmenitiesWritePermission (sync)
 *     → requireAmenityAdminWrite (sync)
 *     → updateAmenityForCommunity(
 *         communityId, amenityId, actorUserId, { ...fields }, x-request-id)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `updateAmenityForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  requireAmenityAdminWrite,
  requireAmenitiesEnabled,
  requireAmenitiesWritePermission,
} from '@/lib/work-orders/common';
import { updateAmenityForCommunity } from '@/lib/services/work-orders-service';
import { amenitiesUpdateContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(amenitiesUpdateContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesWritePermission(membership);
    requireAmenityAdminWrite(membership);

    return updateAmenityForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        name: body.name,
        description: body.description,
        location: body.location,
        capacity: body.capacity,
        isBookable: body.isBookable,
        bookingRules: body.bookingRules,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
