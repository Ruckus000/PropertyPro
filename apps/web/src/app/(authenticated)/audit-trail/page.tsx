/**
 * Audit trail: a permanent, plain-language record of what happened in the
 * community and who did it.
 *
 * Route: /audit-trail?communityId=X (plus view, period, person, entity, item,
 * entry — see lib/audit/audit-query.ts)
 * Auth: isAdminRole(membership.role) — the v3 admin tier, property_manager or
 *        root_manager. Board designation grants no access (ADR-006).
 * Read-only: no mutation capabilities.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole } from '@propertypro/shared';
import { AuditTrailViewer } from '@/components/audit/AuditTrailViewer';
import { PageHeader } from '@/components/shared/page-header';
import { PageBody } from '@/components/shared/page-body';

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
      <PageHeader title="Audit Trail" />
      <PageBody width="content">
        <AuditTrailViewer communityId={communityId} timeZone={membership.timezone} />
      </PageBody>
    </>
  );
}
