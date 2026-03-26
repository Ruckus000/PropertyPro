export const dynamic = 'force-dynamic';

/**
 * Mobile meetings page — Warm Editorial stone palette redesign.
 *
 * Fetches upcoming + past meetings and delegates rendering to the client component.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { asc, desc, gte, lt } from '@propertypro/db/filters';
import { createScopedClient, meetings } from '@propertypro/db';
import type { Meeting } from '@propertypro/db';
import { resolveTimezone } from '@/lib/utils/timezone';
import { MobileMeetingsContent } from '@/components/mobile/MobileMeetingsContent';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileMeetingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  let membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  try {
    membership = await requireCommunityMembership(communityId, userId);
  } catch {
    redirect('/auth/login');
  }

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasMeetings) {
    redirect(`/mobile?communityId=${communityId}`);
  }

  requirePermission(membership, 'meetings', 'read');

  const timezone = resolveTimezone(membership.timezone);
  const scoped = createScopedClient(communityId);
  const now = new Date();

  const [upcoming, past] = await Promise.all([
    scoped
      .selectFrom<Meeting>(meetings, {}, gte(meetings.startsAt, now))
      .orderBy(asc(meetings.startsAt)),
    scoped
      .selectFrom<Meeting>(meetings, {}, lt(meetings.startsAt, now))
      .orderBy(desc(meetings.startsAt))
      .limit(10),
  ]);

  const serializeMeeting = (m: Meeting) => ({
    id: m.id,
    title: m.title,
    meetingType: m.meetingType,
    startsAt: m.startsAt.toISOString(),
    location: (m as Record<string, unknown>)['location'] as string | null,
  });

  return (
    <MobileMeetingsContent
      upcoming={upcoming.map(serializeMeeting)}
      past={past.map(serializeMeeting)}
      timezone={timezone}
    />
  );
}
