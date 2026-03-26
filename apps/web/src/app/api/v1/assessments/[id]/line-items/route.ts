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
  listActorUnitIdsForFinance,
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

  await requireFinanceEnabled(membership);
  requireFinanceReadPermission(membership);

  const searchParams = new URL(req.url).searchParams;
  const rawUnitId = searchParams.get('unitId');
  let unitId: number | undefined;

  if (membership.role === 'resident' && membership.isUnitOwner) {
    const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
    if (actorUnitIds.length === 0) {
      throw new ForbiddenError('No unit is associated with this owner in the selected community');
    }
    if (!rawUnitId && actorUnitIds.length > 1) {
      throw new BadRequestError('unitId query parameter is required when you are associated with multiple units');
    }
    if (rawUnitId) {
      const requestedUnitId = parsePositiveInt(rawUnitId, 'unitId');
      if (!actorUnitIds.includes(requestedUnitId)) {
        throw new ForbiddenError('Owners can only access line items for their own unit');
      }
      unitId = requestedUnitId;
    } else {
      unitId = actorUnitIds[0];
    }
  } else {
    if (rawUnitId) {
      unitId = parsePositiveInt(rawUnitId, 'unitId');
    }
  }

  const lineItems = await listAssessmentLineItemsForCommunity(communityId, assessmentId, unitId);
  return NextResponse.json({ data: lineItems });
});
