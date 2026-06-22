/**
 * Units Page — manage community units (list + create).
 *
 * Route: /dashboard/units?communityId=X
 * Auth: gated on units.read; write actions gated on units.write.
 */
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { UnitsPageClient } from '@/components/units/units-page-client';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UnitsPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Units</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Add a valid <code className="rounded bg-surface-muted px-1">communityId</code> query parameter to view units.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  requirePermission(membership, 'units', 'read');

  const canWrite = checkPermissionV2(
    membership.role,
    membership.communityType,
    'units',
    'write',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );

  return (
    <UnitsPageClient
      communityId={context.communityId}
      communityType={membership.communityType}
      canWrite={canWrite}
    />
  );
}
