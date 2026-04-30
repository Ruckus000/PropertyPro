/**
 * Violations — admin review inbox and ARC requests (tabbed).
 *
 * Route: /violations?communityId=X
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity, isAdminRole } from '@propertypro/shared';
import { ViolationsInboxTabs } from '@/components/violations/ViolationsInboxTabs';
import { FeatureGate } from '@/components/billing/feature-gate';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ViolationsPage({ searchParams }: PageProps) {
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
  if (!typeFeatures.hasViolations) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Violations</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Review, track, and manage violation cases and ARC requests for the community.
        </p>
      </div>

      <ViolationsInboxTabs
        communityId={communityId}
        userId={userId}
        userRole={membership.role}
      />
    </FeatureGate>
  );
}
