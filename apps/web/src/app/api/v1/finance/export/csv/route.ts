import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { parseDateOnly, parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { exportLedgerCsv, findActorUnitId } from '@/lib/services/finance-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);

  const searchParams = new URL(req.url).searchParams;
  const rawUnitId = searchParams.get('unitId');
  const rawStartDate = searchParams.get('startDate');
  const rawEndDate = searchParams.get('endDate');

  let unitId: number | undefined;
  if (membership.role === 'resident' && membership.isUnitOwner) {
    const actorUnitId = await findActorUnitId(communityId, actorUserId);
    if (!actorUnitId) {
      throw new ForbiddenError('No unit association found for this owner');
    }
    if (rawUnitId && parsePositiveInt(rawUnitId, 'unitId') !== actorUnitId) {
      throw new ForbiddenError('Owners can only export ledger rows for their own unit');
    }
    unitId = actorUnitId;
  } else {
    requireFinanceReadPermission(membership);
    if (rawUnitId) {
      unitId = parsePositiveInt(rawUnitId, 'unitId');
    }
  }

  const startDate = rawStartDate ? parseDateOnly(rawStartDate, 'startDate') : undefined;
  const endDate = rawEndDate ? parseDateOnly(rawEndDate, 'endDate') : undefined;
  const csv = await exportLedgerCsv(communityId, unitId, startDate, endDate);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename=\"finance-ledger-${communityId}.csv\"`,
    },
  });
});
