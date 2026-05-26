/**
 * Route contract for `PATCH /api/v1/packages/[id]/pickup`.
 *
 * Plan A1 drain #69. Staff-operator package-pickup endpoint. HTTP method is
 * PATCH — package pickup is a state mutation on an existing package record
 * (per the pre-migration source). Mirrors the visitors check-in/check-out
 * shape (drains #53/#66) with one extra body field (`pickedUpByName`).
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePackageLoggingEnabled  (ASYNC — awaited)
 *     → requirePackagesWritePermission (sync — wraps `requirePermission(membership, 'packages', 'write')`)
 *     → requireStaffOperator           (sync)
 *     → pickupPackageForCommunity(communityId, packageId, actorUserId, { pickedUpByName }, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('package id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body is `{ communityId, pickedUpByName }`. The package id comes from the
 * `[id]` path segment.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `pickupPackageForCommunity` returns a Drizzle row that carries `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50/#53/#66 precedent).
 *
 * `permission: { resource: 'packages', action: 'write' }` matches the
 * runtime gate inside `requirePackagesWritePermission`. `packages` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid package pickup payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code
 * unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const packagesPickupContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/packages/[id]/pickup',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      pickedUpByName: z.string().trim().min(1).max(240),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'packages', action: 'write' },
});
