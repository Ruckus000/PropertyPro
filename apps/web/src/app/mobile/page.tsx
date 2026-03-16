export const dynamic = 'force-dynamic';

/**
 * P3-48/49: Mobile home/dashboard page.
 *
 * Renders recent announcements and upcoming meetings in compact card layout.
 * Data reuses the same loadDashboardData helper as the desktop portal.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';
import { getPublishedTemplate } from '@/lib/api/site-template';
import { CompactCard } from '@/components/mobile/CompactCard';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileHomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  try {
    await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  // If a custom mobile template has been published, render it instead
  const mobileHtml = await getPublishedTemplate(communityId, 'mobile');
  if (mobileHtml) {
    return <div dangerouslySetInnerHTML={{ __html: mobileHtml }} />;
  }

  const data = await loadDashboardData(communityId, userId!);

  return (
    <div>
      {/* Recent announcements */}
      <div className="mt-1">
        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Announcements
        </div>
        {data.announcements.length === 0 ? (
          <p className="mobile-empty">No recent announcements</p>
        ) : (
          data.announcements.map((a) => (
            <CompactCard
              key={a.id}
              title={a.title}
              subtitle={a.isPinned ? 'Pinned' : undefined}
              meta={new Date(a.publishedAt).toLocaleDateString('en-US', { timeZone: data.timezone })}
              href={`/mobile/announcements/${a.id}?communityId=${communityId}`}
            />
          ))
        )}
      </div>

      {/* Upcoming meetings */}
      {data.meetings.length > 0 && (
        <div className="mt-2">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Upcoming Meetings
          </div>
          {data.meetings.map((m) => (
            <CompactCard
              key={m.id}
              title={m.title}
              subtitle={m.meetingType}
              meta={new Date(m.startsAt).toLocaleDateString('en-US', { timeZone: data.timezone })}
              href={`/mobile/meetings?communityId=${communityId}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
