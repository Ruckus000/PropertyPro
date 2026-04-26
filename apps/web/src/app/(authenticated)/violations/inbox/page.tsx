/**
 * Violations Admin Inbox — Phase 1C
 *
 * Route: /violations/inbox?communityId=X
 * Auth: admin roles only (board_member, board_president, cam, site_manager, property_manager_admin)
 * Feature gate: hasViolations must be enabled for the community type
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

export default async function ViolationsInboxPage({ searchParams }: PageProps) {
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

  // Type-gate: if the community type doesn't support violations, redirect.
  // Plan-gate is delegated to <FeatureGate>, which renders the marketing surface
  // for non-tenants and redirects tenants to /dashboard.
  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasViolations) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Violations Inbox</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Review, track, and manage violation cases for the community.
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
