import { redirect } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { FeatureGate } from '@/components/billing/feature-gate';
import { AssessmentManager } from '@/components/finance/assessment-manager';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Assessment Management — admin-only page for managing community assessments.
 *
 * Route: /communities/[id]/assessments
 * Auth: board_member, board_president, cam, site_manager, property_manager_admin.
 */
export default async function AssessmentsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Assessments</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid community ID</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasFinance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  return (
    <FeatureGate feature="hasFinance" communityId={communityId}>
      <AssessmentManager
        communityId={communityId}
        userId={userId}
        userRole={membership.role}
      />
    </FeatureGate>
  );
}
