import { NextResponse, type NextRequest } from 'next/server';
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors';
import { requireCommunityType } from '@/lib/utils/community-validators';
import { parseCommunityIdFromQueryOrHeader } from '@/lib/calendar/request';
import { requireCalendarSyncEnabled } from '@/lib/calendar/common';
import { generateCommunityMeetingsIcs } from '@/lib/services/calendar-sync-service';

interface CommunityRow {
  [key: string]: unknown;
  id: number;
  name: string;
  communityType: string;
}

/**
 * Public ICS calendar feed — intentionally unauthenticated.
 *
 * ICS feeds must be accessible without auth so calendar applications
 * (Google Calendar, Apple Calendar, Outlook) can subscribe and poll
 * for updates. Community is resolved via subdomain middleware.
 * Access is gated by the `hasCalendarSync` feature flag.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const communityId = parseCommunityIdFromQueryOrHeader(req);
  const scoped = createScopedClient(communityId);

  const communityRows = await scoped.selectFrom<CommunityRow>(
    communities,
    {
      id: communities.id,
      name: communities.name,
      communityType: communities.communityType,
    },
    eq(communities.id, communityId),
  );

  const community = communityRows[0];
  if (!community) {
    throw new NotFoundError('Community not found');
  }

  requireCalendarSyncEnabled(
    requireCommunityType(
      community.communityType,
      `calendar meetings feed communityId=${communityId}`,
    ),
  );

  const calendarName = `${community.name} Meetings`;
  const body = await generateCommunityMeetingsIcs(communityId, calendarName);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="meetings.ics"',
      'cache-control': 'no-store',
    },
  });
});
