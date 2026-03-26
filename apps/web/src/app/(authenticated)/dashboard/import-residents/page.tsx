/**
 * Import Residents Page — bulk CSV import wizard for community residents.
 *
 * Route: /dashboard/import-residents?communityId=X
 * Auth: admin roles only (board_member, board_president, cam, site_manager, pm_admin).
 */
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { ImportResidentsClient } from '@/components/residents/import-residents-client';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ImportResidentsPage({ searchParams }: PageProps) {
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
        <h1 className="text-2xl font-semibold text-content">Import Residents</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Add a valid <code className="rounded bg-surface-muted px-1">communityId</code> query parameter to import residents.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  if (!membership.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Import Residents</h1>
        <p className="mt-2 text-sm text-content-secondary">
          You do not have permission to import residents.
        </p>
      </div>
    );
  }

  return (
    <ImportResidentsClient
      communityId={context.communityId}
    />
  );
}
