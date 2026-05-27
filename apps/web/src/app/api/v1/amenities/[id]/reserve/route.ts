/**
 * Amenities — reserve an amenity.
 *
 * POST /api/v1/amenities/[id]/reserve
 * Body: { communityId, unitId?, startTime, endTime, notes? }
 *
 * Plan A1 drain #78. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Mirrors drain #70
 * (reservations/[id]/cancel) plumbing for the amenities plan-gate stack,
 * AND drain #61 (arc/[id]/withdraw) for the in-handler scoped DB call.
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
 *     → if (isResidentRole) {
 *         scoped = createScopedClient(communityId)   ← SCOPED DB CALL
 *         actorUnitIds = await getActorUnitIds(scoped, actorUserId)
 *         if (resolvedUnitId === null)
 *           resolvedUnitId = await requireActorUnitId(scoped, actorUserId)
 *         if (!actorUnitIds.includes(resolvedUnitId))
 *           throw new ForbiddenError(
 *             'Residents can only reserve amenities for their own unit')
 *       }
 *     → createReservationForCommunity(
 *         communityId, actorUserId,
 *         { amenityId, unitId, startTime, endTime, notes },
 *         x-request-id)
 *
 * B1 Slice 5 inline-error migration: the pre-migration resident
 * unit-mismatch branch returned an inline
 * `NextResponse.json({ error: { code: 'FORBIDDEN', message: ... } }, { status: 403 })`.
 * Replaced by `throw new ForbiddenError(...)` with the message preserved
 * byte-identical. `withErrorHandler` still emits the canonical
 * `{ error: { code: 'FORBIDDEN', message } }` envelope at status 403, so the
 * wire shape is unchanged.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `createReservationForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { ForbiddenError } from '@/lib/api/errors';
import {
  getActorUnitIds,
  isResidentRole,
  requireActorUnitId,
  requireAmenitiesEnabled,
  requireAmenitiesWritePermission,
  requireReservationPermission,
} from '@/lib/work-orders/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { createReservationForCommunity } from '@/lib/services/work-orders-service';
import { amenitiesReserveContract } from './contract';

export const POST = withErrorHandler(
  runRoute(amenitiesReserveContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    await requirePlanFeature(communityId, 'hasAmenities');
    requireAmenitiesWritePermission(membership);
    requireReservationPermission(membership);

    let resolvedUnitId: number | null = body.unitId ?? null;

    if (isResidentRole(membership.role)) {
      const scoped = createScopedClient(communityId);
      const actorUnitIds = await getActorUnitIds(scoped, actorUserId);
      if (resolvedUnitId === null) {
        resolvedUnitId = await requireActorUnitId(scoped, actorUserId);
      }
      if (!actorUnitIds.includes(resolvedUnitId)) {
        throw new ForbiddenError(
          'Residents can only reserve amenities for their own unit',
        );
      }
    }

    return createReservationForCommunity(
      communityId,
      actorUserId,
      {
        amenityId: params.id,
        unitId: resolvedUnitId,
        startTime: body.startTime,
        endTime: body.endTime,
        notes: body.notes ?? null,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
