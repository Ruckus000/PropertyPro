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
import { createScopedClient, meetings } from '@propertypro/db';
import { CompactCard } from '@/components/mobile/CompactCard';

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

  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(meetings);
  const now = Date.now();
  const upcoming = rows
    .filter((r) => new Date(r['startsAt'] as string).getTime() >= now)
    .sort((a, b) => new Date(a['startsAt'] as string).getTime() - new Date(b['startsAt'] as string).getTime());

  return (
    <div>
      <div className="mobile-page-header">Meetings</div>
      {upcoming.length === 0 ? (
        <p className="mobile-empty">No upcoming meetings</p>
      ) : (
        upcoming.map((m) => (
          <CompactCard
            key={m['id'] as number}
            title={m['title'] as string}
            subtitle={m['meetingType'] as string}
            meta={new Date(m['startsAt'] as string).toLocaleDateString()}
          />
        ))
      )}
    </div>
  );
}
