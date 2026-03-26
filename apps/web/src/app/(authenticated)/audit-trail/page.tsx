/**
 * P3-53: Audit Trail Viewer page.
 *
 * Route: /audit-trail?communityId=X
 * Auth: community admin required (board_member, board_president, cam,
 *        site_manager, property_manager_admin).
 * Read-only: no mutation capabilities.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole } from '@propertypro/shared';
import { AuditTrailViewer } from '@/components/audit/AuditTrailViewer';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function AuditTrailPage({ searchParams }: PageProps) {
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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-content">Audit Trail</h1>
        <p className="mt-1 text-sm text-content-secondary">
          View compliance and security audit events for this community.
        </p>
      </div>

      <AuditTrailViewer communityId={communityId} />
    </>
  );
}
