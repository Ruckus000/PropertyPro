import { AdminLayout } from '@/components/AdminLayout';
import { TemplatesPageClient } from '@/components/templates/TemplatesPageClient';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getCoolingDeletionRequestCount } from '@/lib/server/deletion-requests';
import {
  listPublicSiteTemplateRows,
  listPublicSiteTemplateUsageCounts,
} from '@/lib/db/public-site-template-queries';
import { toPublicSiteTemplateListItem } from '@/lib/templates/public-site-template-service';

export default async function TemplatesPage() {
  await requireAdminPageSession();

  const [rowsResult, usageCountsResult, coolingCount] = await Promise.all([
    listPublicSiteTemplateRows(),
    listPublicSiteTemplateUsageCounts(),
    getCoolingDeletionRequestCount(),
  ]);

  if (rowsResult.error) {
    throw new Error(`Failed to load templates: ${rowsResult.error.message}`);
  }

  if (usageCountsResult.error) {
    throw new Error(`Failed to load template usage counts: ${usageCountsResult.error.message}`);
  }

  const templates = (rowsResult.data ?? []).map((row) =>
    toPublicSiteTemplateListItem(row, usageCountsResult.data[row.id] ?? 0),
  );

  return (
    <AdminLayout coolingCount={coolingCount}>
      <TemplatesPageClient initialTemplates={templates} />
    </AdminLayout>
  );
}
