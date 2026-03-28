/**
 * Maintenance Admin Inbox — P3-51
 *
 * Route: /maintenance/inbox?communityId=X
 * Auth: admin roles only (board_member, board_president, cam, site_manager, property_manager_admin)
 * Residents redirected to dashboard.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole } from '@propertypro/shared';
import { AdminInbox } from '@/components/maintenance/AdminInbox';
import { AlertBanner } from '@/components/shared/alert-banner';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MaintenanceInboxPage({ searchParams }: PageProps) {
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

  return (
    <>
      <AlertBanner
        status="info"
        title="Operations is the new home for maintenance."
        description="This legacy inbox is temporary. Use Operations for the unified requests and work-order workflow."
        className="mb-6"
      />
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Maintenance Inbox</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Review, assign, and update maintenance requests from residents.
        </p>
      </div>

      <AdminInbox communityId={communityId} userId={userId} userRole={membership.role} />
    </>
  );
}
