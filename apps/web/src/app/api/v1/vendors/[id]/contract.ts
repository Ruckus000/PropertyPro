/**
 * Route contract for `PATCH /api/v1/vendors/[id]`.
 *
 * Plan A1 drain #74. Admin-facing vendor update endpoint. Mirrors drain #63
 * (`work-orders/[id]/complete`) auth chain — same `requirePlanFeature` async
 * plan-gate against `hasWorkOrders` — with a richer optional-fields body.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireWorkOrdersEnabled (sync — NOT awaited)
 *     → requirePlanFeature(communityId, 'hasWorkOrders')  ← ASYNC plan gate
 *     → requireWorkOrdersWritePermission (sync — wraps `requirePermission`)
 *     → requireWorkOrderAdminWrite (sync — admin role gate)
 *     → updateVendorForCommunity(communityId, vendorId, actorUserId, fields, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('vendor id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `updateVendorForCommunity` returns a Drizzle row that may carry `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#46/#50/#63 precedent).
 *
 * `permission: { resource: 'work_orders', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'work_orders', 'write')` call
 * inside `requireWorkOrdersWritePermission`. `work_orders` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:45`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid vendor update payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code
 * unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const vendorsUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/vendors/[id]',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      name: z.string().trim().min(1).max(240).optional(),
      company: z.string().trim().max(240).nullable().optional(),
      phone: z.string().trim().max(64).nullable().optional(),
      email: z.string().trim().email().max(320).nullable().optional(),
      specialties: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
      isActive: z.boolean().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'work_orders', action: 'write' },
});
