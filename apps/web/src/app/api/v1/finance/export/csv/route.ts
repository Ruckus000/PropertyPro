import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { parseDateOnly, parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { exportLedgerCsv, listActorUnitIdsForFinance } from '@/lib/services/finance-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requireFinanceEnabled(membership);

  const searchParams = new URL(req.url).searchParams;
  const rawUnitId = searchParams.get('unitId');
  const rawStartDate = searchParams.get('startDate');
  const rawEndDate = searchParams.get('endDate');

  let unitId: number | undefined;
  if (membership.role === 'resident' && membership.isUnitOwner) {
    const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
    if (actorUnitIds.length === 0) {
      throw new ForbiddenError('No unit association found for this owner');
    }
    if (!rawUnitId && actorUnitIds.length > 1) {
      throw new BadRequestError('unitId query parameter is required when you are associated with multiple units');
    }
    if (rawUnitId) {
      const requestedUnitId = parsePositiveInt(rawUnitId, 'unitId');
      if (!actorUnitIds.includes(requestedUnitId)) {
        throw new ForbiddenError('Owners can only export ledger rows for their own unit');
      }
      unitId = requestedUnitId;
    } else if (actorUnitIds.length === 1) {
      const onlyUnitId = actorUnitIds[0];
      if (onlyUnitId === undefined) {
        throw new ForbiddenError('No unit association found for this owner');
      }
      unitId = onlyUnitId;
    } else {
      throw new BadRequestError('unitId query parameter is required when you are associated with multiple units');
    }
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
