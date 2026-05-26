/**
 * Route contract for `PATCH /api/v1/amenities/[id]`.
 *
 * Plan A1 drain #75. Amenity update endpoint. Mirrors drain #70
 * (reservations/[id]/cancel) auth chain — same `requirePlanFeature` async
 * per-plan gate — but with a PATCH method, a nested `bookingRules` body
 * schema, and the canonical "OBJECT 4th positional" arg passed to the
 * service call.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireAmenitiesEnabled (sync — NOT awaited)
 *     → requirePlanFeature(communityId, 'hasAmenities')  ← ASYNC plan gate
 *     → requireAmenitiesWritePermission (sync — wraps `requirePermission`)
 *     → requireAmenityAdminWrite (sync)
 *     → updateAmenityForCommunity(
 *         communityId, amenityId, actorUserId, { ...fields }, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('amenity id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `updateAmenityForCommunity` returns a service value that may carry `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50/#63/#70 precedent).
 *
 * `permission: { resource: 'amenities', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'amenities', 'write')` call inside
 * `requireAmenitiesWritePermission`. `amenities` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts:46`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid amenity update payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code unchanged
 * at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const bookingRulesSchema = z.object({
  minDurationMinutes: z.number().int().positive().optional(),
  maxDurationMinutes: z.number().int().positive().optional(),
  advanceBookingDays: z.number().int().positive().optional(),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const amenitiesUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/amenities/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      name: z.string().trim().min(1).max(240).optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      location: z.string().trim().max(240).nullable().optional(),
      capacity: z.number().int().positive().nullable().optional(),
      isBookable: z.boolean().optional(),
      bookingRules: bookingRulesSchema.optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'amenities', action: 'write' },
});
