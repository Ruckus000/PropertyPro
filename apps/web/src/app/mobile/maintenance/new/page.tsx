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
import { createScopedClient } from '@propertypro/db';
import { listActorUnitIds } from '@/lib/units/actor-units';
import { listLiveUnitOptions } from '@/lib/units/unit-labels';

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

  let membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  try {
    membership = await requireCommunityMembership(communityId, userId);
  } catch {
    redirect('/auth/login');
  }

  // Same default as the operations page: a resident's form opens on their own unit.
  let defaultUnit: { id: number; label: string } | undefined;
  if (membership.role === 'resident') {
    const scoped = createScopedClient(communityId);
    [defaultUnit] = await listLiveUnitOptions(scoped, await listActorUnitIds(scoped, userId));
  }

  return (
    <MobileSubmitRequestContent
      communityId={communityId}
      userId={userId}
      defaultUnitId={defaultUnit?.id}
      defaultUnitLabel={defaultUnit?.label}
    />
  );
}
