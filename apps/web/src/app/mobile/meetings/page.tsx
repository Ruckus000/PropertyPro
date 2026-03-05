export const dynamic = 'force-dynamic';

/**
 * P3-48/49: Mobile meetings list page.
 *
 * Only reachable via BottomTabBar for condo/HOA communities (features.hasMeetings).
 * For apartment communities the Meetings tab is hidden and this page redirects.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { asc, gte } from '@propertypro/db/filters';
import { createScopedClient, meetings } from '@propertypro/db';
import type { Meeting } from '@propertypro/db';
import { resolveTimezone } from '@/lib/utils/timezone';
import { CompactCard } from '@/components/mobile/CompactCard';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';

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
    membership = await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  // Gate: redirect apartment communities (tab should be hidden but guard here too)
  const features = getFeaturesForCommunity(membership!.communityType);
  if (!features.hasMeetings) {
    redirect(`/mobile?communityId=${communityId}`);
  }

  const timezone = resolveTimezone(membership!.timezone);
  const scoped = createScopedClient(communityId);
  // Filter and sort at the DB level; communityId + deletedAt IS NULL are injected automatically
  const upcoming = await scoped
    .selectFrom<Meeting>(meetings, {}, gte(meetings.startsAt, new Date()))
    .orderBy(asc(meetings.startsAt));

  return (
    <div>
      <MobilePageHeader>Meetings</MobilePageHeader>
      {upcoming.length === 0 ? (
        <p className="mobile-empty">No upcoming meetings</p>
      ) : (
        upcoming.map((m) => (
          <CompactCard
            key={m.id}
            title={m.title}
            subtitle={m.meetingType}
            meta={new Date(m.startsAt).toLocaleDateString('en-US', { timeZone: timezone })}
          />
        ))
      )}
    </div>
  );
}
