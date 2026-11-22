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
import { PackagesStaffPage } from '@/components/packages/packages-staff-page';
import { describeAccess } from '@/lib/access/describe-access';
import { isDesignPreviewOn } from '@/lib/design-preview';

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

  // ponytail: two views of this page while the pilot is judged. Trigger: the owner
  // approves or rejects the pilot (plan Task 19), or 30 days after the pilot merges.
  const preview = await isDesignPreviewOn(userId);

  if (preview && isStaff) {
    return (
      <FeatureGate feature="hasPackageLogging" communityId={communityId}>
        <PackagesStaffPage
          communityId={communityId}
          about={describeAccess(membership.communityType, 'packages', 'own')}
        />
      </FeatureGate>
    );
  }

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
