/**
 * Route contracts for `GET` and `POST /api/v1/visitors/denied`.
 *
 * Plan A1 drain #94. Staff-operator denied-visitor list (paginated) and
 * create endpoints.
 *
 * GET auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireVisitorLoggingEnabled  (ASYNC — awaited)
 *     → requireVisitorsReadPermission (sync)
 *     → requireStaffOperator           (sync)
 *     → paginateDeniedVisitors({ communityId, cursor, pageSize, onlyActive })
 *
 * The optional `active` query filter (`true` / `false` / absent) is parsed
 * manually in the handler from `req.url` — NOT declared in the contract —
 * to preserve tri-state semantics (`'garbage'` → undefined).
 *
 * POST auth surface:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireVisitorLoggingEnabled  (ASYNC — awaited)
 *     → requireVisitorsWritePermission (sync)
 *     → requireStaffOperator           (sync)
 *     → createDeniedVisitor(..., x-request-id)
 *
 * Pre-migration `parseCommunityIdFromQuery` / `parseCommunityIdFromBody`
 * (which delegated to `resolveEffectiveCommunityId`) are now expressed as
 * Zod-validated inputs plus explicit `resolveEffectiveCommunityId` in the
 * handler. Missing/invalid `communityId` yields canonical 400
 * `VALIDATION_ERROR` (status unchanged).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `DeniedVisitorRow` carries `Date` fields and an index signature; tight
 * per-field schemas would `safeParse`-fail before `NextResponse.json`
 * serializes (drain #85 / #50 precedent).
 *
 * `permission` metadata matches runtime `requireVisitors*Permission` gates.
 * `visitors` IS in `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const deniedVisitorCreateBodySchema = z.object({
  communityId: z.number().int().positive(),
  fullName: z.string().min(1).max(240),
  reason: z.string().min(1).max(500),
  vehiclePlate: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const visitorsDeniedListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/visitors/denied',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      cursor: z.string().min(1).max(256).optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'visitors', action: 'read' },
});

export const visitorsDeniedCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/visitors/denied',
  request: {
    body: deniedVisitorCreateBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'visitors', action: 'write' },
});
