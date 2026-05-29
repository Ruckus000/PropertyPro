/**
 * Route contracts for `PATCH` and `DELETE /api/v1/visitors/denied/[id]`.
 *
 * Plan A1 drain #122. Staff-operator denied-visitor update and soft-delete.
 * Sibling collection drained in #94.
 *
 * PATCH: body validated by contract; "at least one field" rule preserved
 * in-handler after auth (#117 precedent). `communityId` in body +
 * `resolveEffectiveCommunityId` in-handler (replaces `parseCommunityIdFromBody`).
 *
 * DELETE response: tight `z.object({ success: true })` — synthesized.
 * PATCH response: loose `z.unknown()` — `DeniedVisitorRow` carries `Date` fields.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const visitorsDeniedUpdateBodySchema = z.object({
  communityId: z.number().int().positive(),
  fullName: z.string().min(1).max(240).optional(),
  reason: z.string().min(1).max(500).optional(),
  vehiclePlate: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const visitorsDeniedUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/visitors/denied/[id]',
  request: {
    params: paramsSchema,
    body: visitorsDeniedUpdateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'visitors', action: 'write' },
});

export const visitorsDeniedDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/visitors/denied/[id]',
  request: {
    params: paramsSchema,
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.object({
    success: z.literal(true),
  }),
  permission: { resource: 'visitors', action: 'write' },
});
