/**
 * ARC Submissions API.
 *
 * GET   /api/v1/arc  — paginated ARC submissions (Plan B3 rollout)
 * POST  /api/v1/arc  — create a new ARC submission
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper from `@propertypro/db`.
 * - Filters (`status`, `unitId`, and the resident-role `allowedUnitIds`
 *   safeguard) push into the SQL `where` predicate. The prior service
 *   `listArcSubmissionsForCommunity` already built a where clause but
 *   returned an unbounded result set; the route now owns the where
 *   construction inline so the service helper could be deleted.
 * - Order by `id` desc — for monotonic bigserial PKs this is equivalent to
 *   the previous `(createdAt desc, id desc)` composite ordering.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: ArcSubmission[], pagination: { nextCursor, hasMore, pageSize } } }`.
 *
 * Resident-with-no-units short circuit: if a resident has zero allowed unit
 * ids, paginate would receive `inArray(unitId, [])` (drizzle-illegal). We
 * return an empty paginated envelope before reaching paginate, matching the
 * service's prior `return []` behavior.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  arcSubmissions,
  createScopedClient,
  paginate,
  type ArcSubmissionStatus,
} from '@propertypro/db';
import { and, eq, inArray } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  getActorUnitIds,
  isResidentRole,
  requireArcEnabled,
  requireArcSubmitterRole } from '@/lib/violations/common';
import {
  createArcSubmissionForCommunity,
  mapArcRow,
  type ArcSubmissionRecord,
} from '@/lib/services/violations-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePermission } from '@/lib/db/access-control';

const createArcSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  projectType: z.string().trim().min(1).max(120),
  estimatedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimatedCompletionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  attachmentDocumentIds: z.array(z.number().int().positive()).optional(),
});

const listArcStatusSchema = z.enum(['submitted', 'under_review', 'approved', 'denied', 'withdrawn']);

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

function emptyPage(pageSize: number) {
  return NextResponse.json({
    data: {
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize },
    },
  });
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireArcEnabled(membership);
  requirePermission(membership, 'arc_submissions', 'read');

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');
  const rawUnitId = searchParams.get('unitId');

  const parsedStatus = rawStatus ? listArcStatusSchema.safeParse(rawStatus) : null;
  if (rawStatus && !parsedStatus?.success) {
    throw new ValidationError('Invalid ARC status filter', {
      fields: [{ field: 'status', message: 'status must be one of submitted, under_review, approved, denied, withdrawn' }],
    });
  }

  const status = parsedStatus?.success ? (parsedStatus.data as ArcSubmissionStatus) : undefined;
  const unitId = rawUnitId ? parsePositiveInt(rawUnitId, 'unitId') : undefined;

  const scoped = createScopedClient(communityId);
  const residentUnitIds = isResidentRole(membership.role)
    ? await getActorUnitIds(scoped, actorUserId)
    : undefined;

  if (residentUnitIds && unitId !== undefined && !residentUnitIds.includes(unitId)) {
    throw new ForbiddenError('You can only view ARC submissions for your own unit');
  }

  // Use `||` not `??` so empty-string query params (`?cursor=`, `?pageSize=`)
  // are treated as missing rather than passed to Zod, which would 400 on the
  // `min(1)` / `positive()` constraints.
  const parsedQuery = listQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });
  if (!parsedQuery.success) {
    throw new ValidationError('Invalid query parameters');
  }

  // Resident with no allowed units: short-circuit before paginate. Drizzle
  // forbids `inArray(col, [])` and the prior service returned `[]` directly.
  if (residentUnitIds && residentUnitIds.length === 0) {
    return emptyPage(parsedQuery.data.pageSize ?? 50);
  }

  const filterClauses = [];
  if (status !== undefined) filterClauses.push(eq(arcSubmissions.status, status));
  if (unitId !== undefined) filterClauses.push(eq(arcSubmissions.unitId, unitId));
  if (residentUnitIds && residentUnitIds.length > 0) {
    filterClauses.push(inArray(arcSubmissions.unitId, residentUnitIds));
  }
  const where =
    filterClauses.length === 0
      ? undefined
      : filterClauses.length === 1
        ? filterClauses[0]
        : and(...filterClauses);

  const result = await paginate<ArcSubmissionRecord>(
    scoped,
    arcSubmissions,
    { cursor: parsedQuery.data.cursor, pageSize: parsedQuery.data.pageSize },
    { where },
  );

  return NextResponse.json({
    data: {
      data: result.data.map(mapArcRow),
      pagination: result.pagination,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createArcSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid ARC submission payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireArcEnabled(membership);
  requirePermission(membership, 'arc_submissions', 'write');
  requireArcSubmitterRole(membership);

  const scoped = createScopedClient(communityId);
  const unitIds = await getActorUnitIds(scoped, actorUserId);
  if (!unitIds.includes(parseResult.data.unitId)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Residents can only submit ARC applications for their own unit' } },
      { status: 403 },
    );
  }

  const requestId = req.headers.get('x-request-id');
  const data = await createArcSubmissionForCommunity(
    communityId,
    actorUserId,
    {
      unitId: parseResult.data.unitId,
      title: parseResult.data.title,
      description: parseResult.data.description,
      projectType: parseResult.data.projectType,
      estimatedStartDate: parseResult.data.estimatedStartDate ?? null,
      estimatedCompletionDate: parseResult.data.estimatedCompletionDate ?? null,
      attachmentDocumentIds: parseResult.data.attachmentDocumentIds },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
