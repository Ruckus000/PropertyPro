import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { FeatureGate } from '@/components/billing/feature-gate';
import { ChecklistListPage } from '@/components/move-checklists/ChecklistListPage';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MoveInOutPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params.communityId);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);
  if (!isAdminRole(membership.role)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasLeaseTracking) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <FeatureGate feature="hasLeaseTracking" communityId={communityId}>
      <PageHeader title="Move In/Out" />
      <ChecklistListPage communityId={communityId} />
    </FeatureGate>
  );
}
