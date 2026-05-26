/**
 * Route contract for `POST /api/v1/work-orders/[id]/complete`.
 *
 * Plan A1 drain #63. Admin-facing work-order completion endpoint. FIRST drain
 * in the corpus that exercises the `requirePlanFeature(communityId, 'hasWorkOrders')`
 * async per-plan feature-flag gate — a new gate type not seen in prior drains.
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
 *     → completeWorkOrderForCommunity(communityId, workOrderId, actorUserId, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('work order id')` is now
 * expressed via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `completeWorkOrderForCommunity` returns a service value that may carry
 * `Date` fields; a tight `z.object({...})` schema would `safeParse`-fail
 * against real Date instances before `NextResponse.json` ISO-serializes
 * them (drain #14/#18/#20/#32/#42/#46/#50 precedent).
 *
 * `permission: { resource: 'work_orders', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'work_orders', 'write')` call
 * inside `requireWorkOrdersWritePermission`. `work_orders` IS in
 * `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts:45`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid complete-work-order payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code unchanged
 * at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const workOrdersCompleteContract = defineRoute({
  method: 'POST',
  path: '/api/v1/work-orders/[id]/complete',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'work_orders', action: 'write' },
});
