import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole } from '@propertypro/shared';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { ChecklistListPage } from '@/components/move-checklists/ChecklistListPage';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MoveInOutPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params.communityId);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

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

  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasLeaseTracking) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Move In/Out</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Manage move-in and move-out checklists for apartment units
        </p>
      </div>
      <ChecklistListPage communityId={communityId} />
    </>
  );
}
