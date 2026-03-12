import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { parseDateOnly, parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { findActorUnitId, listLedgerForCommunity } from '@/lib/services/finance-service';

const ALLOWED_ENTRY_TYPES = new Set([
  'assessment',
  'payment',
  'refund',
  'fine',
  'fee',
  'adjustment',
]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);

  const searchParams = new URL(req.url).searchParams;
  const rawUnitId = searchParams.get('unitId');
  const rawStartDate = searchParams.get('startDate');
  const rawEndDate = searchParams.get('endDate');
  const rawEntryType = searchParams.get('entryType');
  const rawLimit = searchParams.get('limit');

  let unitId: number | undefined;
  if (membership.role === 'owner') {
    const actorUnitId = await findActorUnitId(communityId, actorUserId);
    if (!actorUnitId) {
      throw new ForbiddenError('No unit association found for this owner');
    }
    if (rawUnitId && parsePositiveInt(rawUnitId, 'unitId') !== actorUnitId) {
      throw new ForbiddenError('Owners can only access ledger entries for their own unit');
    }
    unitId = actorUnitId;
  } else {
    requireFinanceReadPermission(membership);
    if (rawUnitId) {
      unitId = parsePositiveInt(rawUnitId, 'unitId');
    }
  }

  let entryType:
    | 'assessment'
    | 'payment'
    | 'refund'
    | 'fine'
    | 'fee'
    | 'adjustment'
    | undefined;
  if (rawEntryType) {
    if (!ALLOWED_ENTRY_TYPES.has(rawEntryType)) {
      throw new BadRequestError('entryType must be one of assessment, payment, refund, fine, fee, adjustment');
    }
    entryType = rawEntryType as typeof entryType;
  }

  const startDate = rawStartDate ? parseDateOnly(rawStartDate, 'startDate') : undefined;
  const endDate = rawEndDate ? parseDateOnly(rawEndDate, 'endDate') : undefined;
  if (startDate && endDate && startDate > endDate) {
    throw new BadRequestError('startDate must be less than or equal to endDate');
  }

  let limit: number | undefined;
  if (rawLimit) {
    limit = parsePositiveInt(rawLimit, 'limit');
  }

  const ledgerEntries = await listLedgerForCommunity(communityId, {
    unitId,
    startDate,
    endDate,
    entryType,
    limit,
  });

  return NextResponse.json({ data: ledgerEntries });
});
