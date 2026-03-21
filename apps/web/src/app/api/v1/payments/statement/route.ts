import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { buildUnitStatement, findActorUnitId, resolveStatementDateRange } from '@/lib/services/finance-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requireFinanceEnabled(membership);

  const searchParams = new URL(req.url).searchParams;
  const rawUnitId = searchParams.get('unitId');
  const rawStartDate = searchParams.get('startDate');
  const rawEndDate = searchParams.get('endDate');

  const { startDate, endDate } = resolveStatementDateRange(rawStartDate, rawEndDate);

  let unitId: number;
  if (membership.role === 'resident' && membership.isUnitOwner) {
    const actorUnitId = await findActorUnitId(communityId, actorUserId);
    if (!actorUnitId) {
      throw new ForbiddenError('No unit association found for this owner');
    }
    if (rawUnitId && parsePositiveInt(rawUnitId, 'unitId') !== actorUnitId) {
      throw new ForbiddenError('Owners can only access statements for their own unit');
    }
    unitId = actorUnitId;
  } else {
    requireFinanceReadPermission(membership);
    if (!rawUnitId) {
      throw new BadRequestError('unitId query parameter is required');
    }
    unitId = parsePositiveInt(rawUnitId, 'unitId');
  }

  const statement = await buildUnitStatement(communityId, unitId, startDate, endDate);
  return NextResponse.json({ data: statement });
});
