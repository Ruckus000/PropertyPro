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
import { ViolationsAdminInbox } from '@/components/violations/ViolationsAdminInbox';
import { FeatureGate } from '@/components/billing/feature-gate';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

/**
 * Violations Admin Inbox
 *
 * Route: /violations?communityId=X
 * Auth: admin roles only (board_member, board_president, cam, site_manager, property_manager_admin)
 * Feature gate: hasViolations must be enabled for the community type
 */
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

  // Type-gate: if the community type doesn't support violations, redirect.
  // Plan-gate is delegated to <FeatureGate>, which renders the marketing surface
  // for non-tenants and redirects tenants to /dashboard.
  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasViolations) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
      {/*
        Legal gates ride on `membership` (hydrated from community_settings), NOT
        through <FeatureGate> — that resolves via requirePlanFeature, which fails
        open when a community has no plan. Passing a plain boolean from this
        server component is the same pattern the board layout uses.
      */}
      <ViolationsAdminInbox
        communityId={communityId}
        userId={userId}
        userRole={membership.role}
        finesEnabled={membership.violationFinesEnabled}
      />
    </FeatureGate>
  );
}
