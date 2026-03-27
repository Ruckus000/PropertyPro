import { notFound } from 'next/navigation';
import { AdminLayout } from '@/components/AdminLayout';
import { TemplateEditorPage } from '@/components/templates/TemplateEditorPage';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getCoolingDeletionRequestCount } from '@/lib/server/deletion-requests';
import {
  getPublicSiteTemplateRow,
  getPublicSiteTemplateUsageCount,
} from '@/lib/db/public-site-template-queries';
import { toPublicSiteTemplateDetail } from '@/lib/templates/public-site-template-service';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string }>;
}

export default async function TemplateEditorRoute({ params, searchParams }: PageProps) {
  await requireAdminPageSession();

  const [{ id: rawId }, query, coolingCount] = await Promise.all([
    params,
    searchParams,
    getCoolingDeletionRequestCount(),
  ]);
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [rowResult, usageResult] = await Promise.all([
    getPublicSiteTemplateRow(id),
    getPublicSiteTemplateUsageCount(id),
  ]);

  if (rowResult.error) {
    throw new Error(`Failed to load template: ${rowResult.error.message}`);
  }

  if (!rowResult.data) {
    notFound();
  }

  if (usageResult.error) {
    throw new Error(`Failed to load template usage: ${usageResult.error.message}`);
  }

  const templateRow = rowResult.data;
  if (!templateRow) {
    notFound();
  }

  return (
    <AdminLayout coolingCount={coolingCount}>
      <TemplateEditorPage
        initialTemplate={toPublicSiteTemplateDetail(templateRow, usageResult.count)}
        focusName={query.focus === 'name'}
      />
    </AdminLayout>
  );
}
