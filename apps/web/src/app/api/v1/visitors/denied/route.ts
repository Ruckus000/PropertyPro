/**
 * Denied Visitors API.
 *
 * GET   /api/v1/visitors/denied  — paginated denied-visitor list (Plan B3 rollout)
 * POST  /api/v1/visitors/denied  — create a new denied-visitor entry
 *
 * GET pagination (Plan B3, A3 service wrapper):
 * - Cursor-based via the canonical `paginate()` helper, called from
 *   `paginateDeniedVisitors` in package-visitor-service.
 * - The optional `active` filter pushes into the SQL `where` predicate.
 * - Order by `id` desc — for monotonic bigserial PKs this is equivalent to
 *   the previous `desc(createdAt)` sort. Same-instant inserts may break ties
 *   differently; rare edge case.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: DeniedVisitorRow[], pagination } }`.
 *
 * Staff-only: `requireStaffOperator(membership)` blocks residents at the
 * authorization layer. There is no resident-allowedUnitIds scoping (denied
 * visitors are a community-wide list maintained by staff).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import {
  createDeniedVisitor,
  paginateDeniedVisitors,
} from '@/lib/services/package-visitor-service';

const createDeniedSchema = z.object({
  communityId: z.number().int().positive(),
  fullName: z.string().min(1).max(240),
  reason: z.string().min(1).max(500),
  vehiclePlate: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsReadPermission(membership);
  requireStaffOperator(membership);

  const { searchParams } = new URL(req.url);
  const rawActive = searchParams.get('active');
  const onlyActive =
    rawActive === 'true' ? true : rawActive === 'false' ? false : undefined;

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

  const result = await paginateDeniedVisitors({
    communityId,
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
    onlyActive,
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
  const parsed = createDeniedSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid denied visitor payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsWritePermission(membership);
  requireStaffOperator(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await createDeniedVisitor(communityId, actorUserId, {
    fullName: parsed.data.fullName,
    reason: parsed.data.reason,
    vehiclePlate: parsed.data.vehiclePlate ?? null,
    notes: parsed.data.notes ?? null,
  }, requestId);

  return NextResponse.json({ data }, { status: 201 });
});
