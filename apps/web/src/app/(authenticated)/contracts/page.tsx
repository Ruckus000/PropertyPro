/**
 * P3-52: Contract & Vendor Tracking page.
 *
 * Route: /contracts?communityId=X
 * Auth: community admin required (board_member, board_president, cam,
 *        site_manager, property_manager_admin).
 * Feature gate: hasCompliance must be true (condo/HOA only).
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole } from '@propertypro/shared';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { ContractTable } from '@/components/contracts/ContractTable';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ContractsPage({ searchParams }: PageProps) {
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

  // Feature gate: compliance communities only
  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasCompliance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  if (!isAdminRole(membership.role)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Contracts & Vendors</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Track vendor contracts, manage bids, and monitor expiration dates.
        </p>
      </div>

      <ContractTable communityId={communityId} />
    </>
  );
}
