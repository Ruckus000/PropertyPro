/**
 * Amenities — amenity schedule
 *
 * GET /api/v1/amenities/[id]/schedule?communityId=N
 *
 * Plan A1 bundle drain #33. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId)
 *   → requireCommunityMembership
 *   → requireAmenitiesEnabled (sync)
 *   → requirePlanFeature(communityId, 'hasAmenities') (async)
 *   → requireAmenitiesReadPermission (sync)
 *   → getAmenityScheduleForCommunity(communityId, amenityId)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` / missing
 * or non-numeric `communityId` shifts to the canonical `VALIDATION_ERROR`
 * envelope. Status unchanged. Success wire shape `{ data: schedule }`
 * byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  requireAmenitiesEnabled,
  requireAmenitiesReadPermission,
} from '@/lib/work-orders/common';
import { getAmenityScheduleForCommunity } from '@/lib/services/work-orders-service';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { amenitiesScheduleGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(amenitiesScheduleGetContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const schedule = await getAmenityScheduleForCommunity(communityId, params.id);
    if (membership.isAdmin) return schedule;
    // Residents see when the amenity is booked, and the full details of their
    // OWN bookings only — never another resident's userId, unit or notes
    // (route-authz census F5; /reservations already scopes residents this way).
    return schedule.map((row) =>
      row.userId === actorUserId
        ? { ...row, isMine: true }
        : {
            id: row.id,
            amenityId: row.amenityId,
            startTime: row.startTime,
            endTime: row.endTime,
            status: row.status,
            isMine: false,
          },
    );
  }),
);
