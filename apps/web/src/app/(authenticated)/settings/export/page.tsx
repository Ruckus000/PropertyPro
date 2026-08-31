import { headers } from 'next/headers';
import { ExportButton } from '@/components/settings/export-button';
import { ExportJobCard } from '@/components/settings/export-job-card';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasBoardDesignation } from '@propertypro/shared';

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
  const membership = await requireCommunityMembership(context.communityId, userId);

  // Mirrors `requireExportPermission` on the routes. The ROUTES are the
  // enforcement point — this only avoids rendering controls that would 403.
  // Both exports are management/board-only: the quick CSV still carries every
  // resident's contact details, so it is not a lesser surface than the archive.
  const canExport =
    membership.isAdmin || hasBoardDesignation(membership.designation);

  if (!canExport) {
    return (
      <>
        <h1 className="mb-2 text-xl font-semibold">Data Export</h1>
        <p className="text-sm text-content-secondary">
          Exporting the community record set is available to property managers and
          board members. If you need a copy of your own records, ask your
          association&apos;s manager or a board member.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Data Export</h1>
      <p className="mb-6 text-sm text-content-secondary">
        You can export your community&apos;s records at any time, including after a
        subscription has lapsed. Two options: a quick spreadsheet-style export, or
        the complete archive with every uploaded file.
      </p>

      <div className="space-y-6">
        {/*
          Both are kept deliberately. The synchronous CSV export is the right tool
          for a small association that wants a spreadsheet now; the async job is
          the one that satisfies the Terms' full-records promise, because it
          includes the document FILES and does not truncate.
        */}
        <div className="rounded-md border border-edge bg-surface-card p-5">
          <h2 className="text-base font-semibold text-content-primary">
            Quick CSV export
          </h2>
          <p className="mb-4 mt-1 text-sm text-content-secondary">
            A ZIP of spreadsheet files covering residents, documents, maintenance
            requests, and announcements. Downloads immediately. Record details
            only — it does not include the uploaded document files.
          </p>
          <ExportButton communityId={context.communityId} />
        </div>

        <ExportJobCard communityId={context.communityId} />
      </div>
    </>
  );
}
