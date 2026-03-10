import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { BadRequestError, ValidationError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  parsePositiveInt,
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { generateAssessmentLineItemsForCommunity } from '@/lib/services/finance-service';

const generateSchema = z.object({
  communityId: z.number().int().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

export const POST = withErrorHandler(async (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const actorUserId = await requireAuthenticatedUserId();
  const assessmentId = await parseAssessmentId(context);

  const body: unknown = await req.json();
  const parseResult = generateSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid line-item generation payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);

  const requestId = req.headers.get('x-request-id');
  const result = await generateAssessmentLineItemsForCommunity(
    communityId,
    assessmentId,
    actorUserId,
    parseResult.data.dueDate ?? null,
    requestId,
  );

  return NextResponse.json({ data: result });
});
