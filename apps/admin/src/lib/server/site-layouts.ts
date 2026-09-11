/**
 * Layout-catalog loader for the two surfaces that render it: the
 * `/site-templates` hub (read-only cards) and `/site-templates/layouts`
 * (the editing table). One loader rather than a copy per page — the two
 * surfaces must agree on which layouts exist and in what order, and a second
 * copy of the `.order('is_featured').order('display_name')` pair is exactly
 * the kind of divergence that produces two screens disagreeing about the same
 * table.
 *
 * AUTHZ: `site_layout_metadata` is platform-wide, NOT tenant-scoped, so this
 * uses the admin Supabase client directly. Both callers gate on
 * `requireAdminPageSession()` before invoking this.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { LayoutRow } from '@/components/site-templates/LayoutsTable';

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

export async function loadLayouts(): Promise<LayoutRow[]> {
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
