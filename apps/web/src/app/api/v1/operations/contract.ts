/**
 * Contract for `GET /api/v1/operations`.
 *
 * Plan A1 drain #177. Cross-source operations feed (maintenance, work orders,
 * reservations). Hand-rolled cursor pagination — **not** `paginate: true`
 * (inner payload is `{ data: items[], meta }`, single-wrapped by the runner).
 *
 * Auth chain (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireOperationsEnabled(features)
 *     → resident role ForbiddenError
 *     → requirePermission(maintenance, read) + requirePermission(work_orders, read)
 *     → listOperationsForCommunity
 *
 * Bespoke 503 `{ error: { code, message } }` when every source is unavailable —
 * preserved via route-level dispatch after `runRoute` (drain #154 precedent).
 *
 * Response: `z.unknown()` — `OperationsListResponse` includes nested arrays and
 * evolving meta fields; consumer `use-operations` pins the TS shape.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const operationsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/operations',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      cursor: z.string().trim().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      type: z.enum(['maintenance_request', 'work_order', 'reservation']).optional(),
      status: z.string().trim().min(1).max(64).optional(),
      priority: z.string().trim().min(1).max(32).optional(),
      unitId: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'maintenance', action: 'read' },
});
