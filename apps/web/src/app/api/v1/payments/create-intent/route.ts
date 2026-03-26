import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { createPaymentIntentForLineItem, findActorUnitId } from '@/lib/services/finance-service';

const createIntentSchema = z.object({
  communityId: z.number().int().positive(),
  lineItemId: z.number().int().positive(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createIntentSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid payment intent payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  await requireActiveSubscriptionForMutation(communityId);

  let allowedUnitId: number | undefined;
  if (membership.role === 'resident' && membership.isUnitOwner) {
    const actorUnitId = await findActorUnitId(communityId, actorUserId);
    if (!actorUnitId) {
      throw new ForbiddenError('No unit association found for this owner');
    }
    allowedUnitId = actorUnitId;
  } else {
    requireFinanceAdminWrite(membership);
  }

  const result = await createPaymentIntentForLineItem(communityId, {
    lineItemId: parseResult.data.lineItemId,
    actorUserId,
    allowedUnitId,
    requestId: req.headers.get('x-request-id'),
  });

  return NextResponse.json({ data: result });
});
