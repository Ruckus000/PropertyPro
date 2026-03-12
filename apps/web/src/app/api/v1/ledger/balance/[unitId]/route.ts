import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { findActorUnitId, getLedgerBalanceForUnit } from '@/lib/services/finance-service';

async function parseUnitId(
  context?: { params: Promise<Record<string, string>> },
): Promise<number> {
  const rawUnitId = (await context?.params)?.['unitId'] ?? '';
  if (!rawUnitId) {
    throw new BadRequestError('unitId route parameter is required');
  }
  return parsePositiveInt(rawUnitId, 'unitId');
}

export const GET = withErrorHandler(async (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const requestedUnitId = await parseUnitId(context);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);

  let unitId = requestedUnitId;
  if (membership.role === 'owner') {
    const actorUnitId = await findActorUnitId(communityId, actorUserId);
    if (!actorUnitId) {
      throw new ForbiddenError('No unit association found for this owner');
    }
    if (actorUnitId !== requestedUnitId) {
      throw new ForbiddenError('Owners can only access balance for their own unit');
    }
    unitId = actorUnitId;
  } else {
    requireFinanceReadPermission(membership);
  }

  const balanceCents = await getLedgerBalanceForUnit(communityId, unitId);
  return NextResponse.json({
    data: {
      unitId,
      balanceCents,
      balanceDollars: (balanceCents / 100).toFixed(2),
    },
  });
});
