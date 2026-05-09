/**
 * Work Orders API.
 *
 * GET   /api/v1/work-orders  — paginated work-orders list (Plan B3 rollout)
 * POST  /api/v1/work-orders  — create a new work order
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper from `@propertypro/db`.
 * - Filters (`status`, `unitId`, resident `allowedUnitIds`) push into the SQL
 *   `where` predicate.
 * - Order by `id` desc — equivalent to the previous `desc(createdAt)` for
 *   monotonic bigserial PKs.
 * - Per-page `mapWorkOrderRow` + `deriveSlaState` post-processing applied
 *   to the returned page.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: WorkOrderListItem[], pagination } }`.
 *
 * The client helper `useWorkOrders` then walks all pages via `walkPaginated`
 * and JS-slices to the requested `page`+`limit` window, preserving the
 * existing offset-style UI contract — same pattern as #228 violations.
 *
 * Resident-with-no-units short circuit: if a resident has zero allowed unit
 * ids, paginate would receive `inArray(unitId, [])` (drizzle-illegal). We
 * return an empty paginated envelope before reaching paginate.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  getActorUnitIds,
  isResidentRole,
  requireWorkOrdersEnabled,
  requireWorkOrdersReadPermission,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import {
  createWorkOrderForCommunity,
  deriveSlaState,
  paginateWorkOrdersForCommunity,
} from '@/lib/services/work-orders-service';

const createWorkOrderSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).nullable().optional(),
  unitId: z.number().int().positive().nullable().optional(),
  vendorId: z.number().int().positive().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['created', 'assigned', 'in_progress', 'completed', 'closed']).optional(),
  slaResponseHours: z.number().int().positive().nullable().optional(),
  slaCompletionHours: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

const listStatusSchema = z.enum(['created', 'assigned', 'in_progress', 'completed', 'closed']);

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireWorkOrdersEnabled(membership);
  await requirePlanFeature(communityId, 'hasWorkOrders');
  requireWorkOrdersReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');
  const rawUnitId = searchParams.get('unitId');

  const parsedStatus = rawStatus ? listStatusSchema.safeParse(rawStatus) : null;
  if (rawStatus && !parsedStatus?.success) {
    throw new ValidationError('Invalid work order status filter', {
      fields: [{ field: 'status', message: 'status must be one of created, assigned, in_progress, completed, closed' }],
    });
  }

  const status = parsedStatus?.success
    ? (parsedStatus.data as WorkOrderStatus)
    : undefined;
  const unitId = rawUnitId ? parsePositiveInt(rawUnitId, 'unitId') : undefined;

  const scoped = createScopedClient(communityId);
  const allowedUnitIds = isResidentRole(membership.role)
    ? await getActorUnitIds(scoped, actorUserId)
    : undefined;

  if (allowedUnitIds && unitId !== undefined && !allowedUnitIds.includes(unitId)) {
    throw new ForbiddenError('You can only view work orders for your own unit');
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

  const result = await paginateWorkOrdersForCommunity({
    communityId,
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
    status,
    unitId,
    allowedUnitIds,
  });

  // mapWorkOrderRow already applied inside paginateWorkOrdersForCommunity.
  // deriveSlaState computes breach flags from row.createdAt +
  // row.slaResponseHours/slaCompletionHours and returns a derived shape,
  // not a row mutation — applied per-page route-side.
  const data = result.data.map((row) => ({
    ...row,
    ...deriveSlaState(row),
  }));

  return NextResponse.json({
    data: {
      data,
      pagination: result.pagination,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createWorkOrderSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid work order payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireWorkOrdersEnabled(membership);
  await requirePlanFeature(communityId, 'hasWorkOrders');
  requireWorkOrdersWritePermission(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await createWorkOrderForCommunity(
    communityId,
    actorUserId,
    {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      unitId: parsed.data.unitId ?? null,
      vendorId: parsed.data.vendorId ?? null,
      priority: parsed.data.priority as WorkOrderPriority | undefined,
      status: parsed.data.status as WorkOrderStatus | undefined,
      slaResponseHours: parsed.data.slaResponseHours ?? null,
      slaCompletionHours: parsed.data.slaCompletionHours ?? null,
      notes: parsed.data.notes ?? null,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
