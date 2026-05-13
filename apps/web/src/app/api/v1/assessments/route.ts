import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { ValidationError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceReadPermission,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  createAssessmentForCommunity,
  paginateAssessmentsForCommunity,
} from '@/lib/services/finance-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

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

const listAssessmentsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireFinanceEnabled(membership);
  requireFinanceReadPermission(membership);

  const searchParams = new URL(req.url).searchParams;
  const parsedQuery = listAssessmentsQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });

  if (!parsedQuery.success) {
    throw new ValidationError('Invalid assessments query', {
      fields: formatZodErrors(parsedQuery.error),
    });
  }

  const result = await paginateAssessmentsForCommunity(communityId, {
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
  });

  return NextResponse.json({
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
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
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);

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
