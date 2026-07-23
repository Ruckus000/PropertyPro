/**
 * Work order detail API — get and update a work order.
 *
 * GET  /api/v1/work-orders/[id]
 * PATCH /api/v1/work-orders/[id]
 *
 * Plan A1 drain #119 — migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { createScopedClient, type WorkOrderPriority, type WorkOrderStatus } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  getActorUnitIds,
  isResidentRole,
  requireWorkOrderAdminWrite,
  requireWorkOrdersEnabled,
  requireWorkOrdersReadPermission,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import { getWorkOrderForCommunity, updateWorkOrderForCommunity } from '@/lib/services/work-orders-service';
import {
  workOrderDetailGetContract,
  workOrderUpdateContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(workOrderDetailGetContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    await requirePlanFeature(communityId, 'hasWorkOrders');
    requireWorkOrdersReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const data = await getWorkOrderForCommunity(communityId, params.id);

    if (isResidentRole(membership.role)) {
      const scoped = createScopedClient(communityId);
      const allowedUnitIds = await getActorUnitIds(scoped, actorUserId);
      if (data.unitId !== null && !allowedUnitIds.includes(data.unitId)) {
        throw new ForbiddenError('You can only view work orders for your own unit');
      }
    }

    return data;
  }),
);

export const PATCH = withErrorHandler(
  runRoute(workOrderUpdateContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();

    if (
      body.title === undefined
      && body.description === undefined
      && body.unitId === undefined
      && body.vendorId === undefined
      && body.priority === undefined
      && body.status === undefined
      && body.slaResponseHours === undefined
      && body.slaCompletionHours === undefined
      && body.notes === undefined
    ) {
      throw new ValidationError('At least one field must be provided for update');
    }

    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    await requirePlanFeature(communityId, 'hasWorkOrders');
    requireWorkOrdersWritePermission(membership);

    const requiresAdminWrite =
      body.vendorId !== undefined
      || body.status !== undefined
      || body.slaResponseHours !== undefined
      || body.slaCompletionHours !== undefined;

    if (requiresAdminWrite) {
      requireWorkOrderAdminWrite(membership);
    }

    const requestId = req.headers.get('x-request-id');
    return updateWorkOrderForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        title: body.title,
        description: body.description,
        unitId: body.unitId,
        vendorId: body.vendorId,
        priority: body.priority as WorkOrderPriority | undefined,
        status: body.status as WorkOrderStatus | undefined,
        slaResponseHours: body.slaResponseHours,
        slaCompletionHours: body.slaCompletionHours,
        notes: body.notes,
      },
      requestId,
    );
  }),
);
