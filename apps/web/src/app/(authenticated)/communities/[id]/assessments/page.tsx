import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
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
        <h1 className="text-2xl font-semibold text-gray-900">Assessments</h1>
        <p className="mt-2 text-sm text-red-600">Invalid community ID</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  return (
    <AssessmentManager
      communityId={communityId}
      userId={userId}
      userRole={membership.role}
    />
  );
}
