/**
 * Lease Management Page — Wave 4 Apartment Features
 *
 * Route: /dashboard/leases?communityId=X
 * Auth: admin roles only
 * Feature gate: hasLeaseTracking (apartment only)
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { FeatureGate } from '@/components/billing/feature-gate';
import { LeaseListPage } from '@/components/leases/LeaseListPage';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function LeasesPage({ searchParams }: PageProps) {
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
  if (!typeFeatures.hasLeaseTracking) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <FeatureGate feature="hasLeaseTracking" communityId={communityId}>
      <PageHeader title="Lease Management" />

      <LeaseListPage communityId={communityId} />
    </FeatureGate>
  );
}
