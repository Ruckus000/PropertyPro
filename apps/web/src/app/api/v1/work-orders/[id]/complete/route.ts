import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireWorkOrderAdminWrite,
  requireWorkOrdersEnabled,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import { completeWorkOrderForCommunity } from '@/lib/services/work-orders-service';

const completeWorkOrderSchema = z.object({
  communityId: z.number().int().positive(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const workOrderId = parsePositiveInt(params?.id ?? '', 'work order id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = completeWorkOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid complete-work-order payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    requireWorkOrdersWritePermission(membership);
    requireWorkOrderAdminWrite(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await completeWorkOrderForCommunity(
      communityId,
      workOrderId,
      actorUserId,
      requestId,
    );

    return NextResponse.json({ data });
  },
);
