/**
 * Work Orders API.
 *
 * GET   /api/v1/work-orders  — paginated work-orders list (Plan B3 rollout)
 * POST  /api/v1/work-orders  — create a new work order
 *
 * Plan A1 drain #108. Contracts in `./contract.ts`; validation and envelope
 * wrapping via `runRoute()`.
 */
import { runRoute } from '@propertypro/api-contract';
import type { NextRequest } from 'next/server';
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
import { workOrdersCreateContract, workOrdersListContract } from './contract';

const listStatusSchema = z.enum(['created', 'assigned', 'in_progress', 'completed', 'closed']);

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(
  runRoute(workOrdersListContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req as NextRequest);
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

    const data = result.data.map((row) => ({
      ...row,
      ...deriveSlaState(row),
    }));

    return {
      data,
      pagination: result.pagination,
    };
  }),
);

export const POST = withErrorHandler(
  runRoute(workOrdersCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req as NextRequest, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    await requirePlanFeature(communityId, 'hasWorkOrders');
    requireWorkOrdersWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    return createWorkOrderForCommunity(
      communityId,
      actorUserId,
      {
        title: body.title,
        description: body.description ?? null,
        unitId: body.unitId ?? null,
        vendorId: body.vendorId ?? null,
        priority: body.priority as WorkOrderPriority | undefined,
        status: body.status as WorkOrderStatus | undefined,
        slaResponseHours: body.slaResponseHours ?? null,
        slaCompletionHours: body.slaCompletionHours ?? null,
        notes: body.notes ?? null,
      },
      requestId,
    );
  }),
);
