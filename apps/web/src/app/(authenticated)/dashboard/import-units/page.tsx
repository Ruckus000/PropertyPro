/**
 * Import Units — bulk CSV import of a community's units.
 *
 * Route: /dashboard/import-units?communityId=X
 * Auth: units:write (the API re-checks).
 */
import { headers } from 'next/headers';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { ImportUnitsClient } from '@/components/units/import-units-client';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ImportUnitsPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([searchParams, headers()]);
  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
  });

  if (!context.communityId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Import units" />
        <p className="mt-2 text-sm text-content-secondary">
          Add a valid <code className="rounded bg-surface-muted px-1">communityId</code> query parameter to import units.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  const canWrite = checkPermissionV2(membership.role, membership.communityType, 'units', 'write', {
    isUnitOwner: membership.isUnitOwner,
  });

  if (!canWrite) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Import units" />
        <p className="mt-2 text-sm text-content-secondary">You do not have permission to add units.</p>
      </div>
    );
  }

  return <ImportUnitsClient communityId={context.communityId} />;
}
