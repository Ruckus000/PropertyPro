import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { FinanceDashboard } from '@/components/finance/finance-dashboard';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Finance Dashboard — admin-only payment overview and reports.
 *
 * Route: /communities/[id]/finance
 * Auth: board_member, board_president, cam, site_manager, property_manager_admin.
 */
export default async function FinancePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Finance</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid community ID</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasFinance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  return (
    <FinanceDashboard
      communityId={communityId}
      userId={userId}
      userRole={membership.role}
    />
  );
}
