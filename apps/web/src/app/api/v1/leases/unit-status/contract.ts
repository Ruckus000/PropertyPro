/**
 * Route contract for `PATCH /api/v1/leases/unit-status` (Leases v3, E7):
 * take a unit offline (storm damage, renovation, model or staff unit) or bring
 * it back. Lives under leases, not `/api/v1/units`, because "offline" only
 * means something to lease tracking and the route is apartment-gated.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

export const leaseUnitStatusPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/leases/unit-status',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        unitId: z.number().int().positive(),
        /** null brings the unit back online. */
        offline: z
          .object({
            reason: z.enum(['storm_damage', 'renovation', 'model_unit', 'staff_unit', 'other']),
            note: z.string().trim().max(500).nullable().optional(),
            since: isoDate,
            until: isoDate.nullable().optional(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
  },
  response: z.unknown(),
  permission: { resource: 'units', action: 'write' },
  tenantScope: { in: 'body' },
});
