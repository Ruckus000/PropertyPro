import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { BadRequestError, ForbiddenError, UnprocessableEntityError, ValidationError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { createPaymentIntentForLineItem, listActorUnitIdsForFinance } from '@/lib/services/finance-service';

const createIntentSchema = z.object({
  communityId: z.number().int().positive(),
  lineItemId: z.number().int().positive().optional(),
  payableId: z.number().int().positive().optional(),
  payableType: z.enum(['assessment_line_item', 'rent_obligation']).optional(),
  unitId: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (!value.lineItemId && !value.payableId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payableId'],
      message: 'Either lineItemId or payableId is required',
    });
  }
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
  await requireActiveSubscriptionForMutation(communityId);

  const payableType = parseResult.data.payableType ?? 'assessment_line_item';
  const allowApartmentTenantRentSelfService =
    membership.role === 'resident' && !membership.isUnitOwner && payableType === 'rent_obligation';
  if (!allowApartmentTenantRentSelfService) {
    requireFinanceWritePermission(membership);
  }

  if (payableType === 'rent_obligation') {
    if (membership.communityType !== 'apartment') {
      throw new UnprocessableEntityError('rent_obligation payables are only supported for apartment communities');
    }
    if (parseResult.data.payableId === undefined) {
      throw new BadRequestError('payableId is required for payableType rent_obligation');
    }
    if (parseResult.data.lineItemId !== undefined) {
      throw new UnprocessableEntityError('lineItemId cannot be used with payableType rent_obligation');
    }
  }

  let allowedUnitId: number | undefined;
  if (membership.role === 'resident' && membership.isUnitOwner) {
    const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
    if (actorUnitIds.length === 0) {
      throw new ForbiddenError('No unit association found for this owner');
    }
    const requestedUnitId = parseResult.data.unitId;
    if (requestedUnitId !== undefined) {
      if (!actorUnitIds.includes(requestedUnitId)) {
        throw new ForbiddenError('Owners can only create payment intents for their own units');
      }
      allowedUnitId = requestedUnitId;
    } else if (actorUnitIds.length === 1) {
      const onlyUnitId = actorUnitIds[0];
      if (onlyUnitId === undefined) {
        throw new ForbiddenError('No unit association found for this owner');
      }
      allowedUnitId = onlyUnitId;
    } else {
      throw new BadRequestError('unitId is required when you are associated with multiple units');
    }
  } else if (membership.role === 'resident') {
    if (payableType !== 'rent_obligation') {
      requireFinanceAdminWrite(membership);
    }
    const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
    if (actorUnitIds.length === 0) {
      throw new ForbiddenError('No unit association found for this resident');
    }
    const requestedUnitId = parseResult.data.unitId;
    if (requestedUnitId !== undefined) {
      if (!actorUnitIds.includes(requestedUnitId)) {
        throw new ForbiddenError('Residents can only create payment intents for their own units');
      }
      allowedUnitId = requestedUnitId;
    } else if (actorUnitIds.length === 1) {
      const onlyUnitId = actorUnitIds[0];
      if (onlyUnitId === undefined) {
        throw new ForbiddenError('No unit association found for this resident');
      }
      allowedUnitId = onlyUnitId;
    } else {
      throw new BadRequestError('unitId is required when you are associated with multiple units');
    }
  } else {
    requireFinanceAdminWrite(membership);
  }

  const result = await createPaymentIntentForLineItem(communityId, {
    lineItemId: parseResult.data.lineItemId ?? parseResult.data.payableId!,
    payableId: parseResult.data.payableId,
    payableType,
    actorUserId,
    allowedUnitId,
    requestId: req.headers.get('x-request-id'),
  });

  return NextResponse.json({ data: result });
});
