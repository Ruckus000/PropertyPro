import { ExportButton } from '@/components/settings/export-button';

/**
 * P4-64: Community data export page.
 *
 * Renders a download button that triggers a ZIP export of community data
 * (residents, documents, maintenance requests, announcements).
 */
export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params['communityId'];
  const communityIdStr = Array.isArray(raw) ? raw[0] : raw;
  const communityId = Number(communityIdStr);

  if (!communityIdStr || !Number.isInteger(communityId) || communityId <= 0) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Data Export</h1>
        <p className="text-sm text-gray-600">
          Provide a <code>communityId</code> to export community data.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-xl font-semibold">Data Export</h1>
      <p className="mb-4 text-sm text-gray-600">
        Download a ZIP file containing CSV exports of your community&apos;s residents,
        documents, maintenance requests, and announcements.
      </p>
      <ExportButton communityId={communityId} />
    </div>
  );
}
