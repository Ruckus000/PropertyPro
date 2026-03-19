/**
 * Lease Management Page — Wave 4 Apartment Features
 *
 * Route: /dashboard/leases?communityId=X
 * Auth: admin roles only
 * Feature gate: hasLeaseTracking (apartment only)
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { LeaseListPage } from '@/components/leases/LeaseListPage';

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

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasLeaseTracking) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Lease Management
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Track leases, renewals, and expirations for your community.
        </p>
      </div>

      <LeaseListPage communityId={communityId} />
    </>
  );
}
