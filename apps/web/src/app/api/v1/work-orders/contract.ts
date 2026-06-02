/**
 * Route contracts for `/api/v1/work-orders`.
 *
 * Plan A1 drain #108. Paginated GET + POST create. Mirrors packages (#99)
 * and vendors (#96) patterns.
 *
 * GET query contract carries only `communityId` (via
 * `parseCommunityIdFromQuery` in handler). `status`, `unitId`, `cursor`, and
 * `pageSize` are parsed manually in-handler to preserve:
 *   - auth-before-filter validation order on GET
 *   - empty-string `?cursor=` / `?pageSize=` → missing (packages #99)
 *   - invalid `status` → field-level ValidationError message
 *
 * POST body matches pre-migration `createWorkOrderSchema`.
 *
 * Response: loose `z.unknown()` — rows carry `Date` fields and SLA derivation.
 *
 * `permission: { resource: 'work_orders', action: 'read' | 'write' }` —
 * metadata only; runtime gates use `requireWorkOrders*Permission`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const workOrdersListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/work-orders',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'work_orders', action: 'read' },
});

export const workOrdersCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/work-orders',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      title: z.string().trim().min(1).max(240),
      description: z.string().trim().max(5000).nullable().optional(),
      unitId: z.number().int().positive().nullable().optional(),
      vendorId: z.number().int().positive().nullable().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      status: z.enum(['created', 'assigned', 'in_progress', 'completed', 'closed']).optional(),
      slaResponseHours: z.number().int().positive().nullable().optional(),
      slaCompletionHours: z.number().int().positive().nullable().optional(),
      notes: z.string().trim().max(5000).nullable().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'work_orders', action: 'write' },
});
