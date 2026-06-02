/**
 * Route contracts for `/api/v1/maintenance-requests/[id]` — GET, PATCH, DELETE.
 *
 * Plan A1 drain #129. Detail fetch + staff update + soft-delete.
 *
 * GET/PATCH/DELETE auth chains preserved from pre-migration (see route.ts).
 * PATCH "no fields to update" guard runs after auth + body parse (unchanged).
 *
 * Response: loose `z.unknown()` — `formatRequest` output includes Dates.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const patchBodySchema = z.object({
  communityId: z.number().int().positive(),
  status: z.string().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  resolutionDescription: z.string().nullable().optional(),
  resolutionDate: z.string().datetime().nullable().optional(),
  category: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

const communityQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const maintenanceRequestGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/maintenance-requests/[id]',
  request: {
    params: paramsSchema,
    query: communityQuerySchema,
  },
  response: z.unknown(),
  permission: { resource: 'maintenance', action: 'read' },
});

export const maintenanceRequestPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/maintenance-requests/[id]',
  request: {
    params: paramsSchema,
    body: patchBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'maintenance', action: 'write' },
});

export const maintenanceRequestDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/maintenance-requests/[id]',
  request: {
    params: paramsSchema,
    query: communityQuerySchema,
  },
  response: z.object({ deleted: z.literal(true) }),
  permission: { resource: 'maintenance', action: 'write' },
});
