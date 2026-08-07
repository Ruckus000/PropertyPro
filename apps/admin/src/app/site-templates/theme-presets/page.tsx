/**
 * /admin/site-templates/theme-presets — platform-admin theme preset catalog.
 *
 * PR #6a — read-only list. CRUD lands in subsequent slices.
 *
 * AUTHZ: requireAdminPageSession() gates the page; site_theme_presets is
 * NOT tenant-scoped so the admin Supabase client reads it directly.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { ThemePresetsTable, type ThemePresetRow } from '@/components/site-templates/ThemePresetsTable';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

export const dynamic = 'force-dynamic';

interface RawRow {
  id: number;
  slug: string;
  display_name: string;
  description: string | null;
  tokens: unknown;
  tier: 'essentials' | 'professional' | 'pm';
  is_archived: boolean;
  is_featured: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

async function loadThemePresets(): Promise<ThemePresetRow[]> {
  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('site_theme_presets')
    .select(
      'id, slug, display_name, description, tokens, tier, is_archived, is_featured, version, created_at, updated_at',
    )
    .order('is_featured', { ascending: false })
    .order('display_name', { ascending: true });

  if (error) {
    // Surface the message at render time. The page is admin-only, so a
    // verbose error here is fine; this is not user-facing copy.
    throw new Error(`Failed to load theme presets: ${error.message}`);
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    tokens: (row.tokens ?? {}) as ThemePresetRow['tokens'],
    tier: row.tier,
    isArchived: row.is_archived,
    isFeatured: row.is_featured,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export default async function ThemePresetsPage() {
  await requireAdminPageSession();
  const presets = await loadThemePresets();

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-content">Theme Presets</h1>
          <p className="mt-1 text-sm text-content-tertiary">
            Platform-level token bundles applied to community sites. Read-only in this
            release; create / edit / archive land in subsequent updates.
          </p>
        </div>
        <ThemePresetsTable presets={presets} />
      </div>
    </AdminLayout>
  );
}
