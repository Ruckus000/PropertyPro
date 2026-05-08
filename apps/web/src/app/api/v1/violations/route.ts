/**
 * Violations API.
 *
 * GET   /api/v1/violations  — paginated violations list (Plan B3 rollout)
 * POST  /api/v1/violations  — create a new violation
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper from `@propertypro/db`.
 * - Filters (`status`, `severity`, `unitId`, `createdAfter`, `createdBefore`,
 *   and the resident-role `allowedUnitIds` safeguard) push into the SQL
 *   `where` predicate. The route now owns the where construction inline
 *   rather than delegating to the service. `listViolationsForCommunity` is
 *   preserved for the resident-self-view page (which renders a small list
 *   without needing pagination).
 * - Order by `id` desc — for monotonic bigserial PKs this is equivalent to
 *   the previous `(createdAt desc, id desc)` composite ordering.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: ViolationRecord[], pagination } }`.
 *
 * Resident-with-no-units short circuit: if a resident has zero allowed unit
 * ids, paginate would receive `inArray(unitId, [])` (drizzle-illegal). We
 * return an empty paginated envelope before reaching paginate, matching the
 * service's prior `return []` behavior.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  paginate,
  units,
  violations,
  type ViolationSeverity,
  type ViolationStatus,
} from '@propertypro/db';
import { and, eq, gte, inArray, lte } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import { getActorUnitIds, isResidentRole, requireViolationsEnabled } from '@/lib/violations/common';
import { hydrateReportedByRole } from '@/lib/violations/hydrate-reporter-role';
import { requirePermission } from '@/lib/db/access-control';
import {
  createViolationForCommunity,
  mapViolationRow,
  type ViolationRecord,
} from '@/lib/services/violations-service';

const createViolationSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  category: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  severity: z.enum(['minor', 'moderate', 'major']).optional(),
  evidenceDocumentIds: z.array(z.number().int().positive()).optional(),
});

const listStatusSchema = z.enum([
  'reported',
  'noticed',
  'hearing_scheduled',
  'fined',
  'resolved',
  'dismissed',
]);

const listSeveritySchema = z.enum(['minor', 'moderate', 'major']);

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

  await requireViolationsEnabled(membership);
  requirePermission(membership, 'violations', 'read');

  const { searchParams } = new URL(req.url);
  const rawUnitId = searchParams.get('unitId');
  const rawStatus = searchParams.get('status');
  const rawSeverity = searchParams.get('severity');
  const createdAfter = searchParams.get('createdAfter') ?? undefined;
  const createdBefore = searchParams.get('createdBefore') ?? undefined;

  const unitId = rawUnitId ? parsePositiveInt(rawUnitId, 'unitId') : undefined;
  const status = rawStatus
    ? (listStatusSchema.parse(rawStatus) as ViolationStatus)
    : undefined;
  // Validate severity against the closed enum. Invalid values throw a
  // ZodError → ValidationError via withErrorHandler — matches the strictness
  // of `status` parsing above.
  const severity = rawSeverity
    ? (listSeveritySchema.parse(rawSeverity) as ViolationSeverity)
    : undefined;

  const scoped = createScopedClient(communityId);
  const residentUnitIds = isResidentRole(membership.role)
    ? await getActorUnitIds(scoped, actorUserId)
    : undefined;

  if (residentUnitIds && unitId !== undefined && !residentUnitIds.includes(unitId)) {
    throw new ForbiddenError('You can only view violations for your own unit');
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
  if (status !== undefined) filterClauses.push(eq(violations.status, status));
  if (severity !== undefined) filterClauses.push(eq(violations.severity, severity));
  if (unitId !== undefined) filterClauses.push(eq(violations.unitId, unitId));
  if (residentUnitIds && residentUnitIds.length > 0) {
    filterClauses.push(inArray(violations.unitId, residentUnitIds));
  }
  if (createdAfter) {
    filterClauses.push(gte(violations.createdAt, new Date(createdAfter)));
  }
  if (createdBefore) {
    filterClauses.push(lte(violations.createdAt, new Date(createdBefore)));
  }
  const where =
    filterClauses.length === 0
      ? undefined
      : filterClauses.length === 1
        ? filterClauses[0]
        : and(...filterClauses);

  const result = await paginate<ViolationRecord>(
    scoped,
    violations,
    { cursor: parsedQuery.data.cursor, pageSize: parsedQuery.data.pageSize },
    { where },
  );

  // mapViolationRow normalizes the row (status/severity assertion, evidence
  // array fallback). hydrateReportedByRole decorates each row with the
  // reporter's role — both run per-page since paginate returns one page.
  const mapped = result.data.map(mapViolationRow);
  const hydrated = await hydrateReportedByRole(scoped, mapped);

  return NextResponse.json({
    data: {
      data: hydrated,
      pagination: result.pagination,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createViolationSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid violation payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireViolationsEnabled(membership);
  requirePermission(membership, 'violations', 'write');

  const scoped = createScopedClient(communityId);
  if (isResidentRole(membership.role)) {
    const unitIds = await getActorUnitIds(scoped, actorUserId);
    if (unitIds.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You must be associated with a unit before reporting a violation' } },
        { status: 403 },
      );
    }
    if (!unitIds.includes(parseResult.data.unitId)) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Residents can only report violations for their own unit' } },
        { status: 403 },
      );
    }
  } else {
    // Staff path: validate target unit belongs to this scoped community.
    // createScopedClient injects community_id + deletedAt IS NULL, so a unitId
    // from another tenant returns zero rows here and surfaces as NotFound.
    const matches = await scoped.selectFrom<{ id: number }>(
      units,
      { id: units.id },
      eq(units.id, parseResult.data.unitId),
    );
    if (matches.length === 0) {
      throw new NotFoundError(`Unit ${parseResult.data.unitId} not found in this community`);
    }
  }

  const requestId = req.headers.get('x-request-id');
  const data = await createViolationForCommunity(
    communityId,
    actorUserId,
    {
      unitId: parseResult.data.unitId,
      category: parseResult.data.category,
      description: parseResult.data.description,
      severity: parseResult.data.severity as ViolationSeverity | undefined,
      evidenceDocumentIds: parseResult.data.evidenceDocumentIds },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
