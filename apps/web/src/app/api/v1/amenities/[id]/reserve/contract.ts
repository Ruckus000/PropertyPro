/**
 * Route contract for `POST /api/v1/amenities/[id]/reserve`.
 *
 * Plan A1 drain #78. Amenity reservation creation endpoint. Mirrors drain
 * #70 (reservations/[id]/cancel) auth chain (sync `requireAmenitiesEnabled`
 * + async `requirePlanFeature('hasAmenities')` + sync amenities-write +
 * sync reservation-permission gates) AND drain #61 (arc/[id]/withdraw) in
 * preserving an in-handler `createScopedClient(communityId)` +
 * `getActorUnitIds(scoped, actorUserId)` resident-unit-ownership check.
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
 *     → if (isResidentRole(membership.role)) {
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
 * SCOPED DB CALL preserved: the resident branch's
 * `createScopedClient(communityId)` + `getActorUnitIds` + `requireActorUnitId`
 * step lives inside the handler exactly as it did pre-migration; the runRoute
 * envelope does not abstract this away. Non-resident roles skip the scoped DB
 * lookup entirely (early-skip via `isResidentRole` boolean check).
 *
 * B1 Slice 5 migration: the pre-migration inline
 *   `return NextResponse.json({ error: { code: 'FORBIDDEN', message: ... } },
 *                            { status: 403 })`
 * is now expressed as `throw new ForbiddenError('Residents can only reserve
 * amenities for their own unit')`. Message string preserved byte-identical;
 * the canonical error envelope produced by `withErrorHandler` still emits
 * `{ error: { code: 'FORBIDDEN', message } }` at status 403, so the wire
 * shape is unchanged.
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('amenity id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `createReservationForCommunity` returns a service value that may carry
 * `Date` fields; a tight `z.object({...})` schema would `safeParse`-fail
 * against real Date instances before `NextResponse.json` ISO-serializes
 * them (drain #14/#18/#20/#32/#42/#46/#50/#63/#70 precedent).
 *
 * `permission: { resource: 'amenities', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'amenities', 'write')` call
 * inside `requireAmenitiesWritePermission`. `amenities` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:46`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid reservation payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code unchanged
 * at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const amenitiesReserveContract = defineRoute({
  method: 'POST',
  path: '/api/v1/amenities/[id]/reserve',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      unitId: z.number().int().positive().nullable().optional(),
      startTime: z.string().datetime({ offset: true }),
      endTime: z.string().datetime({ offset: true }),
      notes: z.string().trim().max(5000).nullable().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'amenities', action: 'write' },
});
