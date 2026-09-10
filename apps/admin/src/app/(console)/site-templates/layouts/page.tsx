/**
 * /admin/site-templates/layouts — the layout-metadata EDITING view.
 *
 * Exists because the hub (`/site-templates`) moved to read-only cards in wave 2
 * and that had been the only render site of `LayoutsTable`'s `table` variant —
 * which left the inline edit form, `saveLayoutMetadata`, and the live
 * `PATCH /api/admin/site-templates/layouts/[slug]` handler reachable from
 * nothing but tests. Removing an operator power is a product decision; this was
 * an accident, so the route is restored rather than the capability deleted.
 *
 * AUTHZ: requireAdminPageSession() gates the page; site_layout_metadata is NOT
 * tenant-scoped so the admin Supabase client reads it directly.
 */
import { PageBody } from '@propertypro/ui';
import { LayoutsTable } from '@/components/site-templates/LayoutsTable';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { loadLayouts } from '@/lib/server/site-layouts';

export const dynamic = 'force-dynamic';

export default async function SiteTemplateLayoutsPage() {
  await requireAdminPageSession();
  const layouts = await loadLayouts();

  return (
    <PageBody>
      <AdminPageHeader
        title="Layout Metadata"
        description="Edit the public-facing metadata for each code-shipped layout — display name, tagline, description, tier, and the featured / archived flags. The layout React components themselves ship via PR and are not editable here."
      />
      <LayoutsTable layouts={layouts} variant="table" />
    </PageBody>
  );
}
