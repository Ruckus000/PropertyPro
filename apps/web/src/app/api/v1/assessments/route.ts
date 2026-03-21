import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { ValidationError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceReadPermission,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  createAssessmentForCommunity,
  listAssessmentsForCommunity,
} from '@/lib/services/finance-service';

const createAssessmentSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  amountCents: z.number().int().positive(),
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'one_time']),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  lateFeeAmountCents: z.number().int().min(0).optional(),
  lateFeeDaysGrace: z.number().int().min(0).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireFinanceEnabled(membership);
  requireFinanceReadPermission(membership);

  const assessments = await listAssessmentsForCommunity(communityId);
  return NextResponse.json({ data: assessments });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createAssessmentSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid assessment payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);
  await requirePlanFeature(communityId, 'hasFinance');

  const requestId = req.headers.get('x-request-id');
  const assessment = await createAssessmentForCommunity(
    communityId,
    actorUserId,
    {
      title: parseResult.data.title,
      description: parseResult.data.description ?? null,
      amountCents: parseResult.data.amountCents,
      frequency: parseResult.data.frequency,
      dueDay: parseResult.data.dueDay ?? null,
      lateFeeAmountCents: parseResult.data.lateFeeAmountCents ?? 0,
      lateFeeDaysGrace: parseResult.data.lateFeeDaysGrace ?? 0,
      startDate: parseResult.data.startDate,
      endDate: parseResult.data.endDate ?? null,
      isActive: parseResult.data.isActive ?? true,
    },
    requestId,
  );

  return NextResponse.json({ data: assessment }, { status: 201 });
});
