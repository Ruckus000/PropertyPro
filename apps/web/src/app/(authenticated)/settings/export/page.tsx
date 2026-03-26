import { headers } from 'next/headers';
import { ExportButton } from '@/components/settings/export-button';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';

/**
 * P4-64: Community data export page.
 *
 * Renders a download button that triggers a ZIP export of community data
 * (residents, documents, maintenance requests, announcements).
 *
 * Uses resolveCommunityContext for consistent tenant resolution
 * across all authenticated pages.
 */
export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
      <>
        <h1 className="mb-4 text-xl font-semibold">Data Export</h1>
        <p className="text-sm text-content-secondary">
          Provide a <code>communityId</code> to export community data.
        </p>
      </>
    );
  }

  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(context.communityId, userId);

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Data Export</h1>
      <p className="mb-4 text-sm text-content-secondary">
        Download a ZIP file containing CSV exports of your community&apos;s residents,
        documents, maintenance requests, and announcements.
      </p>
      <ExportButton communityId={context.communityId} />
    </>
  );
}
