/**
 * Route contract for `GET /api/v1/assessments/[id]/line-items`.
 *
 * Plan A1 bundle drain #34. Returns an array of line items
 * (objects with Date fields). `z.unknown()` response keeps it loose
 * (drain #14/#18/#20 precedent).
 *
 * Note: the `unitId` query param is OPTIONAL at the schema level —
 * the handler enforces the resident "must-supply-when-owning-multiple-units"
 * rule and the "owners-can-only-access-their-own-unit" rule, both of which
 * remain in the handler verbatim.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const assessmentsLineItemsGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/assessments/[id]/line-items',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      unitId: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'read' },
});
