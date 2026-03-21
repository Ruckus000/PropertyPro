import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { getConnectStatus } from '@/lib/services/finance-service';

const CONNECT_STATUS_ROLES = new Set(['manager', 'pm_admin']);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requireFinanceEnabled(membership);
  requireFinanceReadPermission(membership);

  if (!CONNECT_STATUS_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only community finance staff can view Stripe Connect status');
  }

  const status = await getConnectStatus(communityId);
  return NextResponse.json({ data: status });
});
