import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import {
  parsePositiveInt,
  requireFinanceEnabled,
  requireFinanceReadPermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  findActorUnitId,
  listAssessmentLineItemsForCommunity,
} from '@/lib/services/finance-service';

async function parseAssessmentId(
  context?: { params: Promise<Record<string, string>> },
): Promise<number> {
  const rawId = (await context?.params)?.['id'] ?? '';
  if (!rawId) {
    throw new BadRequestError('Assessment ID is required');
  }
  return parsePositiveInt(rawId, 'Assessment ID');
}

export const GET = withErrorHandler(async (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const assessmentId = await parseAssessmentId(context);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireFinanceEnabled(membership);
  requireFinanceReadPermission(membership);

  const searchParams = new URL(req.url).searchParams;
  const rawUnitId = searchParams.get('unitId');
  let unitId: number | undefined;

  if (membership.role === 'resident' && membership.isUnitOwner) {
    const actorUnitId = await findActorUnitId(communityId, actorUserId);
    if (!actorUnitId) {
      throw new ForbiddenError('No unit is associated with this owner in the selected community');
    }
    if (rawUnitId && parsePositiveInt(rawUnitId, 'unitId') !== actorUnitId) {
      throw new ForbiddenError('Owners can only access line items for their own unit');
    }
    unitId = actorUnitId;
  } else {
    if (rawUnitId) {
      unitId = parsePositiveInt(rawUnitId, 'unitId');
    }
  }

  const lineItems = await listAssessmentLineItemsForCommunity(communityId, assessmentId, unitId);
  return NextResponse.json({ data: lineItems });
});
