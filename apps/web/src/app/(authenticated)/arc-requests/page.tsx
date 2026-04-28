import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity, isAdminRole } from '@propertypro/shared';
import { FeatureGate } from '@/components/billing/feature-gate';
import { ArcSubmissionsTab } from '@/components/violations/ArcSubmissionsTab';
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ArcRequestsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const communityId = rawId;
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
  if (!typeFeatures.hasARC) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <FeatureGate feature="hasARC" communityId={communityId}>
      <PageHeader
        title="ARC Requests"
        description="Review architectural review submissions for your community."
        breadcrumb={
          <Breadcrumbs
            items={[{ label: 'Compliance', href: `/communities/${communityId}/compliance` }]}
            currentLabel="ARC Requests"
          />
        }
      />
      <ArcSubmissionsTab communityId={communityId} />
    </FeatureGate>
  );
}
