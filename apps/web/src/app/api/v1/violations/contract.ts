/**
 * Route contracts for `/api/v1/violations` — GET (paginated list) + POST (create).
 *
 * Plan A1 auto-drain. Migrated from the pre-migration `withErrorHandler`
 * handlers in `./route.ts`.
 *
 * GET auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromQuery(req)
 *     → requireCommunityMembership
 *     → requireViolationsEnabled (async)
 *     → requirePermission('violations', 'read') (sync)
 *     → [resident unit filter + paginateViolationsForCommunity]
 *
 * `communityId` is intentionally NOT declared (required) in the Zod query
 * schema. The handler still owns it via `parseCommunityIdFromQuery(req)`,
 * which throws the pre-migration `BadRequestError` messages
 * (`'communityId query parameter is required'` /
 * `'communityId must be a positive integer'`). Declaring it required in the
 * contract would make the runner reject first with a different
 * `ContractValidationError` envelope/message — so we keep it out of the
 * schema to preserve byte-identical error behavior (corpus rule 11:
 * declare in contract OR parse in handler, never both).
 *
 * `status`, `severity`, `unitId`, `createdAfter`, `createdBefore` are also
 * parsed in-handler from `URL.searchParams` (NOT Zod) to preserve the
 * pre-migration tri-state enum parsing (absent → no filter, valid enum →
 * filter, invalid → `ValidationError` with the legacy message) and the
 * `parsePositiveInt` unitId behavior.
 *
 * Only `cursor`/`pageSize` are declared in the query schema — they map
 * directly onto the paginate input and the runner's empty-string handling.
 *
 * GET response: `paginated: true` with loose per-item `z.unknown()` because
 * `ViolationRecord` carries `Date` fields (`createdAt`, `updatedAt`,
 * `hearingDate`, `resolutionDate`); a tight per-item schema would
 * `safeParse`-fail before `NextResponse.json` ISO-serializes them. Wire
 * envelope: `{ data: { data: ViolationRecord[], pagination } }`.
 *
 * POST auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → createViolationSchema (now the contract body schema)
 *     → parseCommunityIdFromBody(req, body.communityId)
 *     → assertNotDemoGrace (async)
 *     → requireCommunityMembership
 *     → requireViolationsEnabled (async)
 *     → requirePermission('violations', 'write') (sync)
 *     → [resident unit ownership check OR staff unit-exists check]
 *     → createViolationForCommunity(..., requestId)
 *
 * POST response: loose `z.unknown()` for the same Date-field reason.
 *
 * `permission` metadata matches runtime gates: `violations`/`read` (GET) and
 * `violations`/`write` (POST). `violations` IS in `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const createViolationBodySchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  category: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  severity: z.enum(['minor', 'moderate', 'major']).optional(),
  evidenceDocumentIds: z.array(z.number().int().positive()).optional(),
});

export type CreateViolationBody = z.infer<typeof createViolationBodySchema>;

export const violationsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/violations',
  request: {
    query: listQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'violations', action: 'read' },
});

export const violationsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/violations',
  request: {
    body: createViolationBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'violations', action: 'write' },
});
