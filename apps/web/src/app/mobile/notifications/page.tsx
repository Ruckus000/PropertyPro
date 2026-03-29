export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { MobileNotificationsContent } from '@/components/mobile/MobileNotificationsContent';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileNotificationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  try {
    await requireCommunityMembership(communityId, userId);
  } catch {
    redirect('/auth/login');
  }

  return <MobileNotificationsContent communityId={communityId} />;
}
