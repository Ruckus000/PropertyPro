/**
 * /admin/site-templates — layouts catalog (the panel's index tab).
 *
 * Read-only cards here; the editing view lives one click away at
 * `/site-templates/layouts` (the "Layout Metadata" sub-page), which renders the
 * same `LayoutsTable` in its `table` variant.
 *
 * AUTHZ: requireAdminPageSession() gates the page; site_layout_metadata
 * is NOT tenant-scoped so the admin Supabase client reads it directly.
 */
import Link from 'next/link';
import { Button, PageBody } from '@propertypro/ui';
import { LayoutsTable } from '@/components/site-templates/LayoutsTable';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { loadLayouts } from '@/lib/server/site-layouts';

export const dynamic = 'force-dynamic';

export default async function SiteTemplatesIndexPage() {
  await requireAdminPageSession();
  const layouts = await loadLayouts();

  return (
    <PageBody>
      <AdminPageHeader
        title="Site Templates"
        description="Code-shipped layouts available to communities. The layout React components ship via PR; the public-facing metadata (display name, tagline, tier, featured / archived state) is editable under Layout Metadata."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/site-templates/layouts">Layout Metadata →</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/site-templates/block-registry">Block Registry →</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/site-templates/documentation">Documentation →</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/site-templates/theme-presets">Theme Presets →</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/site-templates/starter-packs">Starter Packs →</Link>
            </Button>
          </>
        }
      />
      <LayoutsTable layouts={layouts} variant="cards" />
    </PageBody>
  );
}
