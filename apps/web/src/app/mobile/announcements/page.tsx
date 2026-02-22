export const dynamic = 'force-dynamic';

/**
 * P3-48/49: Mobile announcements list page.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { createScopedClient, announcements } from '@propertypro/db';
import { CompactCard } from '@/components/mobile/CompactCard';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileAnnouncementsPage({ searchParams }: PageProps) {
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

  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(announcements);
  const active = rows
    .filter((r) => r['archivedAt'] == null)
    .sort((a, b) => {
      if (a['isPinned'] && !b['isPinned']) return -1;
      if (!a['isPinned'] && b['isPinned']) return 1;
      return (
        new Date(b['publishedAt'] as string).getTime() -
        new Date(a['publishedAt'] as string).getTime()
      );
    });

  return (
    <div>
      <div className="mobile-page-header">Announcements</div>
      {active.length === 0 ? (
        <p className="mobile-empty">No announcements</p>
      ) : (
        active.map((a) => (
          <CompactCard
            key={a['id'] as number}
            title={a['title'] as string}
            subtitle={(a['isPinned'] as boolean) ? 'Pinned' : undefined}
            meta={new Date(a['publishedAt'] as string).toLocaleDateString()}
          />
        ))
      )}
    </div>
  );
}
