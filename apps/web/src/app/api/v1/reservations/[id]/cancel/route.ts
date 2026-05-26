/**
 * Reservations — cancel a reservation.
 *
 * POST /api/v1/reservations/[id]/cancel
 * Body: { communityId }
 *
 * Plan A1 drain #70. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Mirrors drain #63
 * (work-orders/[id]/complete) — async `requirePlanFeature` gate plus a
 * role-derived `canCancelAny` boolean threaded into the service call.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireAmenitiesEnabled (sync, NOT awaited)
 *     → requirePlanFeature(communityId, 'hasAmenities') (async — awaited)
 *     → requireAmenitiesWritePermission (sync)
 *     → requireReservationPermission (sync — no-op compat guard)
 *     → cancelReservationForCommunity(
 *         communityId, reservationId, actorUserId, canCancelAny, x-request-id)
 *
 * `canCancelAny = !isResidentRole(membership.role)`: residents can only
 * cancel their own reservations; admin roles can cancel any.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `cancelReservationForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  isResidentRole,
  requireAmenitiesEnabled,
  requireAmenitiesWritePermission,
  requireReservationPermission,
} from '@/lib/work-orders/common';
import { cancelReservationForCommunity } from '@/lib/services/work-orders-service';
import { reservationsCancelContract } from './contract';

export const POST = withErrorHandler(
  runRoute(reservationsCancelContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesWritePermission(membership);
    requireReservationPermission(membership);

    const canCancelAny = !isResidentRole(membership.role);

    return cancelReservationForCommunity(
      communityId,
      params.id,
      actorUserId,
      canCancelAny,
      req.headers.get('x-request-id'),
    );
  }),
);
