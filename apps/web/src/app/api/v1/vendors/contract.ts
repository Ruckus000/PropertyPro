/**
 * Route contracts for `GET` and `POST /api/v1/vendors`.
 *
 * Plan A1 drain #96. Collection endpoint for work-order vendor directory
 * (paginated list + admin create). Mirrors drain #74 (`vendors/[id]` PATCH)
 * auth gates — `requirePlanFeature(communityId, 'hasWorkOrders')` is async and
 * runs after the sync `requireWorkOrdersEnabled` check.
 *
 * GET uses `paginated: true` because `paginateVendorsForCommunity` wraps the
 * canonical keyset helper. Wire envelope:
 *   `{ data: { data: VendorRecord[], pagination } }`.
 *
 * Response schemas are intentionally `z.unknown()` (loose): service rows may
 * carry `Date` fields and the `VendorRecord` index signature; tightening risks
 * runner `safeParse` 500s before `NextResponse.json` ISO-serializes (drain
 * #74 / #63 precedent on the same service module).
 *
 * `permission` metadata matches runtime RBAC:
 *   GET  → `requireWorkOrdersReadPermission`  (`work_orders`, `read`)
 *   POST → `requireWorkOrdersWritePermission` + `requireWorkOrderAdminWrite`
 *          (`work_orders`, `write`)
 *
 * Query validation failures surface as 400 `VALIDATION_ERROR` with message
 * `Invalid query parameters` (runner default for `source: 'query'`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const vendorsListQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const createVendorBodySchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(240),
  company: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  specialties: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  isActive: z.boolean().optional(),
});

export const vendorsListGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/vendors',
  request: {
    query: vendorsListQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'work_orders', action: 'read' },
});

export const vendorsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/vendors',
  request: {
    body: createVendorBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'work_orders', action: 'write' },
});
