import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { BadRequestError, ValidationError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { parsePositiveInt, requireFinanceAdminWrite, requireFinanceEnabled, requireFinanceWritePermission } from '@/lib/finance/common';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { deleteAssessmentForCommunity, updateAssessmentForCommunity } from '@/lib/services/finance-service';

const updateAssessmentSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  amountCents: z.number().int().positive().optional(),
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'one_time']).optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  lateFeeAmountCents: z.number().int().min(0).optional(),
  lateFeeDaysGrace: z.number().int().min(0).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
});

async function parseAssessmentId(
  context?: { params: Promise<Record<string, string>> },
): Promise<number> {
  const rawId = (await context?.params)?.['id'] ?? '';
  if (!rawId) {
    throw new BadRequestError('Assessment ID is required');
  }
  return parsePositiveInt(rawId, 'Assessment ID');
}

export const PATCH = withErrorHandler(async (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const actorUserId = await requireAuthenticatedUserId();
  const assessmentId = await parseAssessmentId(context);

  const body: unknown = await req.json();
  const parseResult = updateAssessmentSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid assessment update payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityId: rawCommunityId, ...updates } = parseResult.data;
  if (Object.keys(updates).length === 0) {
    throw new BadRequestError('At least one field must be provided for update');
  }

  const communityId = parseCommunityIdFromBody(req, rawCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);
  await requirePlanFeature(communityId, 'hasFinance');

  const requestId = req.headers.get('x-request-id');
  const assessment = await updateAssessmentForCommunity(
    communityId,
    assessmentId,
    actorUserId,
    updates,
    requestId,
  );

  return NextResponse.json({ data: assessment });
});

export const DELETE = withErrorHandler(async (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const actorUserId = await requireAuthenticatedUserId();
  const assessmentId = await parseAssessmentId(context);
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);
  await requirePlanFeature(communityId, 'hasFinance');

  const requestId = req.headers.get('x-request-id');
  await deleteAssessmentForCommunity(communityId, assessmentId, actorUserId, requestId);

  return NextResponse.json({ success: true });
});
