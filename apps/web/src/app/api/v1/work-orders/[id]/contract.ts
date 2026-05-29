/**
 * Route contracts for `GET` and `PATCH /api/v1/work-orders/[id]`.
 *
 * Plan A1 drain #119. Work order detail + update. Sibling collection drained in #108.
 *
 * GET auth-first: contract omits `communityId` query so invalid/missing
 * `communityId` does not 400 before `requireAuthenticatedUserId` (forum/threads
 * #117 precedent). `communityId` parsed in-handler via `parseCommunityIdFromQuery`.
 *
 * GET resident scoping: inline `{ error: { code, message } }` 403 migrated to
 * `ForbiddenError('You can only view work orders for your own unit')` (#78 precedent).
 *
 * PATCH: body validated by contract; "at least one field" rule preserved
 * in-handler after auth.
 *
 * Response: loose `z.unknown()` — work order rows may carry `Date` fields.
 *
 * `permission` metadata is illustrative; effective gates are work-order helpers.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const workOrderDetailGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/work-orders/[id]',
  request: {
    params: paramsSchema,
  },
  response: z.unknown(),
  permission: { resource: 'work_orders', action: 'read' },
});

export const workOrderUpdateBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  unitId: z.number().int().positive().nullable().optional(),
  vendorId: z.number().int().positive().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['created', 'assigned', 'in_progress', 'completed', 'closed']).optional(),
  slaResponseHours: z.number().int().positive().nullable().optional(),
  slaCompletionHours: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export const workOrderUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/work-orders/[id]',
  request: {
    params: paramsSchema,
    body: workOrderUpdateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'work_orders', action: 'write' },
});
