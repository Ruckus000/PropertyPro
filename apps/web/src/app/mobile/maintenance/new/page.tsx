export const dynamic = 'force-dynamic';

/**
 * Mobile maintenance request submission page.
 *
 * Wraps the existing SubmitForm component with mobile back-header navigation.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { MobileSubmitRequestContent } from '@/components/mobile/MobileSubmitRequestContent';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileMaintenanceNewPage({ searchParams }: PageProps) {
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

  return <MobileSubmitRequestContent communityId={communityId} userId={userId} />;
}
