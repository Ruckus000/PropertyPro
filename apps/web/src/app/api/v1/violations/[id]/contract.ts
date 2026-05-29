/**
 * Route contracts for `GET` and `PATCH /api/v1/violations/[id]`.
 *
 * Plan A1 drain #120. Violation detail + admin update.
 *
 * GET auth-first: contract omits `communityId` query so invalid/missing
 * `communityId` does not 400 before `requireAuthenticatedUserId` (forum/threads
 * #117 precedent). `communityId` parsed in-handler via `parseCommunityIdFromQuery`.
 *
 * GET resident scoping: `getActorUnitIds` passed to service when caller is resident.
 *
 * PATCH: admin-only update; body validated by contract.
 *
 * Response: loose `z.unknown()` — violation rows may carry `Date` fields.
 *
 * `violations` IS in `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const violationDetailGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/violations/[id]',
  request: {
    params: paramsSchema,
  },
  response: z.unknown(),
  permission: { resource: 'violations', action: 'read' },
});

export const violationUpdateBodySchema = z.object({
  communityId: z.number().int().positive(),
  category: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  severity: z.enum(['minor', 'moderate', 'major']).optional(),
  status: z.enum(['reported', 'noticed', 'hearing_scheduled', 'fined', 'resolved', 'dismissed']).optional(),
  evidenceDocumentIds: z.array(z.number().int().positive()).optional(),
  noticeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  hearingDate: z.string().datetime().nullable().optional(),
  resolutionNotes: z.string().max(4000).nullable().optional(),
});

export const violationUpdateContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/violations/[id]',
  request: {
    params: paramsSchema,
    body: violationUpdateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'violations', action: 'write' },
});
