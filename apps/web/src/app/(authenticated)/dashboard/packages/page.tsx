// page-template: delegated to apps/web/src/components/packages/packages-staff-page.tsx, apps/web/src/components/packages/packages-resident-page.tsx
/**
 * Package Logging Page — Wave 4 Apartment Features
 *
 * Route: /dashboard/packages?communityId=X
 * Auth: all community members
 * Feature gate: hasPackageLogging (apartment + condo)
 * View: staff see PackagesStaffPage, residents see PackagesResidentPage
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { FeatureGate } from '@/components/billing/feature-gate';
import { PackagesStaffPage } from '@/components/packages/packages-staff-page';
import { PackagesResidentPage } from '@/components/packages/packages-resident-page';
import { describeAccess } from '@/lib/access/describe-access';

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
      {isStaff ? (
        <PackagesStaffPage
          communityId={communityId}
          about={describeAccess(membership.communityType, 'packages', 'own')}
        />
      ) : (
        <PackagesResidentPage communityId={communityId} />
      )}
    </FeatureGate>
  );
}
