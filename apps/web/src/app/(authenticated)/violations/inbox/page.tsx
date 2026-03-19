/**
 * Violations Admin Inbox — Phase 1C
 *
 * Route: /violations/inbox?communityId=X
 * Auth: admin roles only (board_member, board_president, cam, site_manager, property_manager_admin)
 * Feature gate: hasViolations must be enabled for the community type
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { ViolationsInboxTabs } from '@/components/violations/ViolationsInboxTabs';

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

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasViolations) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Violations Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review, track, and manage violation cases for the community.
        </p>
      </div>

      <ViolationsInboxTabs
        communityId={communityId}
        userId={userId}
        userRole={membership.role}
      />
    </>
  );
}
