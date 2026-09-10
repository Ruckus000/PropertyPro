/**
 * /admin/site-templates — layouts catalog (the panel's index tab).
 *
 * PR #6b — read-only list. Metadata edit lands in subsequent slices.
 *
 * AUTHZ: requireAdminPageSession() gates the page; site_layout_metadata
 * is NOT tenant-scoped so the admin Supabase client reads it directly.
 */
import Link from 'next/link';
import { PageBody } from '@propertypro/ui';
import { LayoutsTable, type LayoutRow } from '@/components/site-templates/LayoutsTable';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

export const dynamic = 'force-dynamic';

interface RawRow {
  id: number;
  slug: string;
  display_name: string;
  tagline: string | null;
  description: string | null;
  tier: 'essentials' | 'professional' | 'pm';
  is_archived: boolean;
  is_featured: boolean;
  default_preset_slug: string | null;
  version: string;
  created_at: string;
  updated_at: string;
}

async function loadLayouts(): Promise<LayoutRow[]> {
  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('site_layout_metadata')
    .select(
      'id, slug, display_name, tagline, description, tier, is_archived, is_featured, default_preset_slug, version, created_at, updated_at',
    )
    .order('is_featured', { ascending: false })
    .order('display_name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load layouts: ${error.message}`);
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    tagline: row.tagline,
    description: row.description,
    tier: row.tier,
    isArchived: row.is_archived,
    isFeatured: row.is_featured,
    defaultPresetSlug: row.default_preset_slug,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export default async function SiteTemplatesIndexPage() {
  await requireAdminPageSession();
  const layouts = await loadLayouts();

  return (
    <PageBody>
      <AdminPageHeader
        title="Site Templates"
        description="Code-shipped layouts available to communities. The layout React components ship via PR; this catalog edits the public-facing metadata (display name, tagline, tier, featured / archived state). Metadata edit lands in a later update."
        actions={
          <>
            <Link
              href="/site-templates/block-registry"
              className="rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-page"
            >
              Block Registry →
            </Link>
            <Link
              href="/site-templates/documentation"
              className="rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-page"
            >
              Documentation →
            </Link>
            <Link
              href="/site-templates/theme-presets"
              className="rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-page"
            >
              Theme Presets →
            </Link>
            <Link
              href="/site-templates/starter-packs"
              className="rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-page"
            >
              Starter Packs →
            </Link>
          </>
        }
      />
      <LayoutsTable layouts={layouts} />
    </PageBody>
  );
}
