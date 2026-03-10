import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError } from '@/lib/api/errors';
import { parseCommunityIdFromQueryOrHeader } from '@/lib/calendar/request';
import {
  requireCalendarSyncEnabledForMembership,
  requireCalendarSyncWritePermission,
} from '@/lib/calendar/common';
import { completeGoogleCalendarConnect } from '@/lib/services/calendar-sync-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQueryOrHeader(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireCalendarSyncEnabledForMembership(membership);
  requireCalendarSyncWritePermission(membership);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  if (!code || code.trim().length === 0) {
    throw new BadRequestError('code query parameter is required');
  }

  const requestId = req.headers.get('x-request-id');
  const data = await completeGoogleCalendarConnect(
    communityId,
    actorUserId,
    code,
    requestId,
  );

  return NextResponse.json({ data });
});
