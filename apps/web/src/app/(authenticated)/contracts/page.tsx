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
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { ContractTable } from '@/components/contracts/ContractTable';

const ADMIN_ROLES = new Set([
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

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
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasCompliance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  // Admin role check
  if (!ADMIN_ROLES.has(membership.role)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Contracts & Vendors</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track vendor contracts, manage bids, and monitor expiration dates.
        </p>
      </div>

      <ContractTable communityId={communityId} />
    </main>
  );
}
