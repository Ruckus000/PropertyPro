export const dynamic = 'force-dynamic';

/**
 * P3-48/49: Mobile announcements list page.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { and, desc, isNull, sql } from '@propertypro/db/filters';
import { createScopedClient, announcements } from '@propertypro/db';
import type { Announcement } from '@propertypro/db';
import { resolveTimezone } from '@/lib/utils/timezone';
import { CompactCard } from '@/components/mobile/CompactCard';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';

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

  let membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  try {
    membership = await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  const timezone = resolveTimezone(membership!.timezone);
  const scoped = createScopedClient(communityId);
  const active = await scoped
    .selectFrom<Announcement>(
      announcements,
      {},
      and(isNull(announcements.archivedAt)),
    )
    .orderBy(desc(sql`${announcements.isPinned}`), desc(announcements.publishedAt));

  return (
    <div>
      <MobilePageHeader>Announcements</MobilePageHeader>
      {active.length === 0 ? (
        <p className="mobile-empty">No announcements</p>
      ) : (
        active.map((a) => (
          <CompactCard
            key={a.id}
            title={a.title}
            subtitle={a.isPinned ? 'Pinned' : undefined}
            meta={new Date(a.publishedAt).toLocaleDateString('en-US', { timeZone: timezone })}
          />
        ))
      )}
    </div>
  );
}
