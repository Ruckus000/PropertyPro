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
  requireWorkOrdersEnabled,
  requireWorkOrdersReadPermission,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import { createWorkOrderForCommunity, listWorkOrdersForCommunity } from '@/lib/services/work-orders-service';

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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireWorkOrdersEnabled(membership);
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

  const data = await listWorkOrdersForCommunity(communityId, {
    status,
    unitId,
    allowedUnitIds,
  });

  return NextResponse.json({ data });
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
