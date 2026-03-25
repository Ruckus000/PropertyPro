import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
} from '@/lib/logistics/common';
import { matchDeniedVisitors } from '@/lib/services/package-visitor-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsReadPermission(membership);
  requireStaffOperator(membership);

  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  const plate = searchParams.get('plate');

  const data = await matchDeniedVisitors(communityId, name, plate);

  return NextResponse.json({ data });
});
