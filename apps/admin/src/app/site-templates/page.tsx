/**
 * /admin/site-templates — layouts catalog (the panel's index tab).
 *
 * PR #6b — read-only list. Metadata edit lands in subsequent slices.
 *
 * AUTHZ: requireAdminPageSession() gates the page; site_layout_metadata
 * is NOT tenant-scoped so the admin Supabase client reads it directly.
 */
import Link from 'next/link';
import { AdminLayout } from '@/components/AdminLayout';
import { LayoutsTable, type LayoutRow } from '@/components/site-templates/LayoutsTable';
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
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Site Templates</h1>
            <p className="mt-1 text-sm text-gray-500">
              Code-shipped layouts available to communities. The layout React components
              ship via PR; this catalog edits the public-facing metadata (display name,
              tagline, tier, featured / archived state). Metadata edit lands in a later
              update.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/site-templates/block-registry"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Block Registry →
            </Link>
            <Link
              href="/site-templates/documentation"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Documentation →
            </Link>
            <Link
              href="/site-templates/theme-presets"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Theme Presets →
            </Link>
            <Link
              href="/site-templates/starter-packs"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Starter Packs →
            </Link>
          </div>
        </div>
        <LayoutsTable layouts={layouts} />
      </div>
    </AdminLayout>
  );
}
