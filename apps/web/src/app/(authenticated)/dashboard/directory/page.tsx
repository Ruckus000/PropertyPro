/**
 * Directory — Units and Residents on one page (rollout flag `directory_v2`).
 *
 * Route: /dashboard/directory?communityId=X&tab=units|residents
 * Auth: units.read. Residents tab, overview stats and access requests are
 * admin-only (v3 admin tier); balances additionally need finances.read and a
 * plan with finance. Hiding UI is not the security boundary — each API
 * re-checks — but the page never fetches what the viewer cannot read.
 *
 * The old /dashboard/units and /dashboard/residents pages stay live until the
 * cutover phase; this page 404s for communities outside the pilot.
 */
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { isDirectoryEnabledForCommunity } from '@/lib/directory/directory-flag';
import { DirectoryPageClient, type DirectoryTab } from '@/components/directory/directory-page-client';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseTab(value: string | string[] | undefined): DirectoryTab {
  return value === 'residents' ? 'residents' : 'units';
}

export default async function DirectoryPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([searchParams, headers()]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Directory" />
        <p className="mt-2 text-sm text-content-secondary">
          Add a valid <code className="rounded bg-surface-muted px-1">communityId</code> query parameter to view the directory.
        </p>
      </div>
    );
  }

  if (!isDirectoryEnabledForCommunity(context.communityId)) {
    notFound();
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  requirePermission(membership, 'units', 'read');

  const features = getFeaturesForCommunity(membership.communityType);
  const permissionContext = { isUnitOwner: membership.isUnitOwner };
  const canWrite = checkPermissionV2(
    membership.role,
    membership.communityType,
    'units',
    'write',
    permissionContext,
  );

  // Sending documents needs the residents list (admin-only) and documents:write,
  // the same permission POST /api/v1/documents/send checks.
  const canSendDocuments =
    membership.isAdmin &&
    checkPermissionV2(membership.role, membership.communityType, 'documents', 'write', permissionContext);

  // Balances: same gates as GET /api/v1/delinquency, evaluated up front so the
  // page does not request a report it would be refused.
  let canSeeBalances =
    membership.isAdmin &&
    features.hasFinance &&
    checkPermissionV2(membership.role, membership.communityType, 'finances', 'read', permissionContext);
  if (canSeeBalances) {
    canSeeBalances = await requirePlanFeature(context.communityId, 'hasFinance').then(
      () => true,
      () => false,
    );
  }

  return (
    <DirectoryPageClient
      communityId={context.communityId}
      communityType={membership.communityType}
      hasOwnerRole={features.hasOwnerRole}
      isAdmin={membership.isAdmin}
      canWrite={canWrite}
      canSeeBalances={canSeeBalances}
      canSendDocuments={canSendDocuments}
      initialTab={membership.isAdmin ? parseTab(resolvedSearchParams['tab']) : 'units'}
    />
  );
}
