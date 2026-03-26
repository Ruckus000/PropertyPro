import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, type WorkOrderPriority, type WorkOrderStatus } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  getActorUnitIds,
  isResidentRole,
  requireWorkOrderAdminWrite,
  requireWorkOrdersEnabled,
  requireWorkOrdersReadPermission,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import { getWorkOrderForCommunity, updateWorkOrderForCommunity } from '@/lib/services/work-orders-service';

const updateWorkOrderSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  unitId: z.number().int().positive().nullable().optional(),
  vendorId: z.number().int().positive().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['created', 'assigned', 'in_progress', 'completed', 'closed']).optional(),
  slaResponseHours: z.number().int().positive().nullable().optional(),
  slaCompletionHours: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const workOrderId = parsePositiveInt(params?.id ?? '', 'work order id');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    requireWorkOrdersReadPermission(membership);

    const data = await getWorkOrderForCommunity(communityId, workOrderId);

    if (isResidentRole(membership.role)) {
      const scoped = createScopedClient(communityId);
      const allowedUnitIds = await getActorUnitIds(scoped, actorUserId);
      if (data.unitId !== null && !allowedUnitIds.includes(data.unitId)) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'You can only view work orders for your own unit',
            },
          },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({ data });
  },
);

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const workOrderId = parsePositiveInt(params?.id ?? '', 'work order id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = updateWorkOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid work order update payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    if (
      parsed.data.title === undefined
      && parsed.data.description === undefined
      && parsed.data.unitId === undefined
      && parsed.data.vendorId === undefined
      && parsed.data.priority === undefined
      && parsed.data.status === undefined
      && parsed.data.slaResponseHours === undefined
      && parsed.data.slaCompletionHours === undefined
      && parsed.data.notes === undefined
    ) {
      throw new ValidationError('At least one field must be provided for update');
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    requireWorkOrdersWritePermission(membership);

    const requiresAdminWrite =
      parsed.data.vendorId !== undefined
      || parsed.data.status !== undefined
      || parsed.data.slaResponseHours !== undefined
      || parsed.data.slaCompletionHours !== undefined;

    if (requiresAdminWrite) {
      requireWorkOrderAdminWrite(membership);
    }

    const requestId = req.headers.get('x-request-id');
    const data = await updateWorkOrderForCommunity(
      communityId,
      workOrderId,
      actorUserId,
      {
        title: parsed.data.title,
        description: parsed.data.description,
        unitId: parsed.data.unitId,
        vendorId: parsed.data.vendorId,
        priority: parsed.data.priority as WorkOrderPriority | undefined,
        status: parsed.data.status as WorkOrderStatus | undefined,
        slaResponseHours: parsed.data.slaResponseHours,
        slaCompletionHours: parsed.data.slaCompletionHours,
        notes: parsed.data.notes,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);
