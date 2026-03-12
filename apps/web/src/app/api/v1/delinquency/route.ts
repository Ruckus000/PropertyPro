import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { listDelinquentUnits } from '@/lib/services/finance-service';

const DELINQUENCY_READ_ROLES = new Set(['manager', 'pm_admin']);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);
  requireFinanceReadPermission(membership);

  if (!DELINQUENCY_READ_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only community finance staff can access delinquency reporting');
  }

  const searchParams = new URL(req.url).searchParams;
  const rawThreshold = searchParams.get('lienThresholdDays');
  const lienThresholdDays = rawThreshold ? parsePositiveInt(rawThreshold, 'lienThresholdDays') : 90;

  const data = await listDelinquentUnits(communityId, lienThresholdDays);
  return NextResponse.json({ data, meta: { lienThresholdDays } });
});
