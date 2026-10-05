/**
 * Leases page — unit roster (Leases v3; plan docs/superpowers/plans/2026-09-29-leases-v3.md)
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
import { LeaseRosterPage } from '@/components/leases/roster/LeaseRosterPage';
import { PageHeader } from '@/components/shared/page-header';
import { utcDateToWallClockValue } from '@/lib/utils/zoned-datetime';

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

  // Lease status is date-derived (Leases v3), so "today" must be the
  // COMMUNITY's date, not the browser's or the server's (AGENTS #16-17).
  const today = utcDateToWallClockValue(new Date(), membership.timezone ?? 'America/New_York').slice(0, 10);

  return (
    <FeatureGate feature="hasLeaseTracking" communityId={communityId}>
      <PageHeader title="Leases" />

      <LeaseRosterPage
        communityId={communityId}
        today={today}
        isRootManager={membership.role === 'root_manager'}
      />
    </FeatureGate>
  );
}
