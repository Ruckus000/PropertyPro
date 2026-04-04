export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { listVisibleAnnouncements } from '@/lib/announcements/read-visibility';
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

  requirePermission(membership, 'announcements', 'read');
  const timezone = resolveTimezone(membership!.timezone);
  const { rows: active } = await listVisibleAnnouncements(communityId, membership);

  const serialized = active.map((a) => ({
    id: a.id,
    title: a.title,
    isPinned: a.isPinned,
    publishedAt: a.publishedAt.toISOString(),
    source: 'Board',
  }));

  return <MobileAnnouncementsContent announcements={serialized} timezone={timezone} />;
}
