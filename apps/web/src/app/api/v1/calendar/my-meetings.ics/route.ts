import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQueryOrHeader } from '@/lib/calendar/request';
import { validateCalendarSubscriptionToken } from '@/lib/calendar/subscription-token';
import {
  requireCalendarSyncEnabledForMembership,
  requireCalendarSyncReadPermission,
} from '@/lib/calendar/common';
import { UnauthorizedError } from '@/lib/api/errors';
import { generateMyCalendarIcs } from '@/lib/services/calendar-sync-service';

async function resolveCalendarFeedActorUserId(
  req: NextRequest,
  communityId: number,
): Promise<string> {
  try {
    return await requireAuthenticatedUserId();
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      throw error;
    }
  }

  const token = new URL(req.url).searchParams.get('token');
  const payload = token ? validateCalendarSubscriptionToken(token) : null;

  if (!payload || payload.communityId !== communityId || payload.scope !== 'my_meetings') {
    throw new UnauthorizedError();
  }

  return payload.userId;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const communityId = parseCommunityIdFromQueryOrHeader(req);
  const actorUserId = await resolveCalendarFeedActorUserId(req, communityId);
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
