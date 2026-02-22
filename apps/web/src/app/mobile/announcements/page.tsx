export const dynamic = 'force-dynamic';

/**
 * P3-48/49: Mobile announcements list page.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { and, desc, isNull, sql } from 'drizzle-orm';
import { createScopedClient, announcements } from '@propertypro/db';
import type { Announcement } from '@propertypro/db';
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
  // Filter and sort at the DB level; communityId + deletedAt IS NULL are injected automatically
  const active = await scoped
    .selectFrom<Announcement>(
      announcements,
      {},
      and(isNull(announcements.archivedAt)),
    )
    .orderBy(desc(sql`${announcements.isPinned}`), desc(announcements.publishedAt));

  return (
    <div>
      <div className="mobile-page-header">Announcements</div>
      {active.length === 0 ? (
        <p className="mobile-empty">No announcements</p>
      ) : (
        active.map((a) => (
          <CompactCard
            key={a.id}
            title={a.title}
            subtitle={a.isPinned ? 'Pinned' : undefined}
            meta={new Date(a.publishedAt).toLocaleDateString()}
          />
        ))
      )}
    </div>
  );
}
