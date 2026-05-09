/**
 * Packages API — staff package log.
 *
 * GET   /api/v1/packages  — paginated package log (Plan B3 rollout)
 * POST  /api/v1/packages  — create a new package log entry
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper from `@propertypro/db`.
 * - Filters (`status`, `unitId`, and the resident-role `allowedUnitIds`
 *   safeguard) are pushed into the SQL `where` predicate. Previously the
 *   underlying service fetched the whole tenant's package log and returned
 *   it unbounded.
 * - Order by `id` desc — for monotonic bigserial PKs this is equivalent to
 *   the previous `(createdAt desc, id desc)` composite ordering.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: PackageLog[], pagination: { nextCursor, hasMore, pageSize } } }`.
 *
 * Note: `/api/v1/packages/my` is intentionally NOT migrated in this PR — it
 * has its own service path (`listMyPackagesForCommunity`) that filters out
 * `picked_up` entries, and the resident-facing UI relies on the flat shape.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError, ForbiddenError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  isResidentRole,
  requireActorUnitIds,
  requirePackageLoggingEnabled,
  requirePackagesReadPermission,
  requirePackagesWritePermission,
  requireStaffOperator,
} from '@/lib/logistics/common';
import {
  createPackageForCommunity,
  paginatePackageLog,
  type PackageLogStatus,
} from '@/lib/services/package-visitor-service';
import { resolveUnitIdByLabel } from '@/lib/services/units-lookup';

const createPackageSchema = z.object({
  communityId: z.number().int().positive(),
  unitNumber: z.string().trim().min(1).max(100),
  recipientName: z.string().trim().min(1).max(240),
  carrier: z.string().trim().min(1).max(120),
  trackingNumber: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const packageStatusSchema = z.enum(['received', 'notified', 'picked_up']);

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requirePackageLoggingEnabled(membership);
  requirePackagesReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');
  const rawUnitId = searchParams.get('unitId');

  const statusParsed = rawStatus ? packageStatusSchema.safeParse(rawStatus) : null;
  if (rawStatus && !statusParsed?.success) {
    throw new ValidationError('Invalid package status filter', {
      fields: [{
        field: 'status',
        message: 'status must be one of received, notified, picked_up',
      }],
    });
  }

  const unitId = rawUnitId ? parsePositiveInt(rawUnitId, 'unitId') : undefined;
  const status = statusParsed?.success
    ? (statusParsed.data as PackageLogStatus)
    : undefined;

  const scoped = createScopedClient(communityId);

  let allowedUnitIds: number[] | undefined;
  if (isResidentRole(membership.role)) {
    allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

    if (unitId !== undefined && !allowedUnitIds.includes(unitId)) {
      throw new ForbiddenError('You can only view packages for your own unit');
    }
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

  const result = await paginatePackageLog({
    communityId,
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
    status,
    unitId,
    allowedUnitIds,
  });

  return NextResponse.json({
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createPackageSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid package payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requirePackageLoggingEnabled(membership);
  requirePackagesWritePermission(membership);
  requireStaffOperator(membership);

  const resolution = await resolveUnitIdByLabel(communityId, parsed.data.unitNumber);
  if (resolution.kind === 'ambiguous') {
    throw new ValidationError(
      `Multiple units share "${parsed.data.unitNumber}". Contact your administrator to resolve duplicates.`,
    );
  }
  if (resolution.kind !== 'resolved') {
    throw new ValidationError(
      `No unit found with number "${parsed.data.unitNumber}". Please check the unit number and try again.`,
    );
  }

  const requestId = req.headers.get('x-request-id');
  const data = await createPackageForCommunity(
    communityId,
    actorUserId,
    {
      unitId: resolution.unitId,
      recipientName: parsed.data.recipientName,
      carrier: parsed.data.carrier,
      trackingNumber: parsed.data.trackingNumber ?? null,
      notes: parsed.data.notes ?? null,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
