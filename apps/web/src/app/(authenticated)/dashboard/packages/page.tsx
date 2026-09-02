/**
 * Package Logging Page — Wave 4 Apartment Features
 *
 * Route: /dashboard/packages?communityId=X
 * Auth: all community members
 * Feature gate: hasPackageLogging (apartment + condo)
 * View: staff see PackageStaffView, residents see PackageResidentView
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { FeatureGate } from '@/components/billing/feature-gate';
import { PackageStaffView } from '@/components/packages/PackageStaffView';
import { PackageResidentView } from '@/components/packages/PackageResidentView';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function PackagesPage({ searchParams }: PageProps) {
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

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasPackageLogging) {
    redirect('/dashboard?reason=feature-not-available');
  }

  const isStaff = isAdminRole(membership.role);

  return (
    <FeatureGate feature="hasPackageLogging" communityId={communityId}>
      <PageHeader title={isStaff ? 'Package Logging' : 'My Packages'} />

      {isStaff ? (
        <PackageStaffView communityId={communityId} />
      ) : (
        <PackageResidentView communityId={communityId} />
      )}
    </FeatureGate>
  );
}
