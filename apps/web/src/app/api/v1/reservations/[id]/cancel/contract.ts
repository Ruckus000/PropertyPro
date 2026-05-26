/**
 * Route contract for `POST /api/v1/reservations/[id]/cancel`.
 *
 * Plan A1 drain #70. Reservation cancellation endpoint. Mirrors drain #63
 * (work-orders/[id]/complete) plumbing — same `requirePlanFeature` async
 * per-plan gate — but with a domain-specific role-derived `canCancelAny`
 * boolean flag passed as the 4th positional arg to the service call.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireAmenitiesEnabled (sync — NOT awaited)
 *     → requirePlanFeature(communityId, 'hasAmenities')  ← ASYNC plan gate
 *     → requireAmenitiesWritePermission (sync — wraps `requirePermission`)
 *     → requireReservationPermission (sync — no-op compat guard)
 *     → cancelReservationForCommunity(
 *         communityId, reservationId, actorUserId, canCancelAny, x-request-id)
 *
 * `canCancelAny = !isResidentRole(membership.role)` — residents can only
 * cancel reservations they own; non-resident roles (cam/site_manager/
 * pm_admin/board_*) can cancel any reservation in the community. The flag
 * is computed in the handler from the membership returned by
 * `requireCommunityMembership` and threaded into the service positionally.
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('reservation id')` is now
 * expressed via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `cancelReservationForCommunity` returns a service value that may carry
 * `Date` fields; a tight `z.object({...})` schema would `safeParse`-fail
 * against real Date instances before `NextResponse.json` ISO-serializes
 * them (drain #14/#18/#20/#32/#42/#46/#50/#63 precedent).
 *
 * `permission: { resource: 'amenities', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'amenities', 'write')` call
 * inside `requireAmenitiesWritePermission`. `amenities` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:46`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid reservation cancel payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code unchanged
 * at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const reservationsCancelContract = defineRoute({
  method: 'POST',
  path: '/api/v1/reservations/[id]/cancel',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'amenities', action: 'write' },
});
