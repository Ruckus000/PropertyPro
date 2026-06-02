/**
 * Route contracts for `/api/v1/arc` — GET (paginated list) + POST (create).
 *
 * Plan A1 drain #173. Migrated from pre-migration `withErrorHandler` handlers.
 *
 * GET auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireArcEnabled
 *     → requirePermission('arc_submissions', 'read')
 *     → [resident unit filter + paginateArcSubmissionsForCommunity]
 *
 * `status` is intentionally NOT in the Zod query schema — the handler reads
 * it from `URL.searchParams` and applies the pre-migration tri-state parse
 * (absent → no filter, valid enum → filter, invalid → ValidationError with
 * the legacy message).
 *
 * `unitId` IS in the query schema (optional positive int). Empty-string
 * `?unitId=` collapses to omitted via the runner's empty-string handling.
 *
 * GET response: `paginated: true` with loose per-item `z.unknown()` because
 * ARC rows carry `Date` fields; wire envelope:
 *   `{ data: { data: ArcSubmission[], pagination } }`.
 *
 * POST auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireArcEnabled
 *     → requirePermission('arc_submissions', 'write')
 *     → requireArcSubmitterRole
 *     → [resident unit ownership check]
 *     → createArcSubmissionForCommunity(..., requestId)
 *
 * POST inline 403 for foreign-unit residents migrated to `ForbiddenError`
 * (corpus standard — drain #435 / Slice 5 precedent).
 *
 * `permission` metadata matches runtime gates. `arc_submissions` IS in
 * `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const listQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
});

export const createArcBodySchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  projectType: z.string().trim().min(1).max(120),
  estimatedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimatedCompletionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  attachmentDocumentIds: z.array(z.number().int().positive()).optional(),
});

export type CreateArcBody = z.infer<typeof createArcBodySchema>;

export const arcListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/arc',
  request: {
    query: listQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'arc_submissions', action: 'read' },
});

export const arcCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/arc',
  request: {
    body: createArcBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'arc_submissions', action: 'write' },
});
