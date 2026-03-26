export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { and, desc, isNull, sql } from '@propertypro/db/filters';
import { createScopedClient, announcements } from '@propertypro/db';
import type { Announcement } from '@propertypro/db';
import { resolveTimezone } from '@/lib/utils/timezone';
import { MobileAnnouncementsContent } from '@/components/mobile/MobileAnnouncementsContent';

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

  const serialized = active.map((a) => ({
    id: a.id,
    title: a.title,
    isPinned: a.isPinned,
    publishedAt: a.publishedAt.toISOString(),
    source: 'Board',
  }));

  return <MobileAnnouncementsContent announcements={serialized} timezone={timezone} />;
}
