import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQueryOrHeader } from '@/lib/calendar/request';
import {
  requireCalendarSyncEnabledForMembership,
  requireCalendarSyncReadPermission,
} from '@/lib/calendar/common';
import { generateMyCalendarIcs } from '@/lib/services/calendar-sync-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQueryOrHeader(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireCalendarSyncEnabledForMembership(membership);
  requireCalendarSyncReadPermission(membership);

  const body = await generateMyCalendarIcs(communityId, actorUserId, membership);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="my-meetings.ics"',
      'cache-control': 'no-store',
    },
  });
});
