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
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { PackageStaffView } from '@/components/packages/PackageStaffView';
import { PackageResidentView } from '@/components/packages/PackageResidentView';

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

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasPackageLogging) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  const isStaff = isAdminRole(membership.role);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          {isStaff ? 'Package Logging' : 'My Packages'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isStaff
            ? 'Log incoming packages and track pickups for residents.'
            : 'View your pending and recent package deliveries.'}
        </p>
      </div>

      {isStaff ? (
        <PackageStaffView communityId={communityId} />
      ) : (
        <PackageResidentView communityId={communityId} />
      )}
    </>
  );
}
