/**
 * Theme Presets API for the platform admin console.
 *
 * GET /api/admin/site-templates/theme-presets — list all theme presets.
 *
 * Read-only in this slice (PR #6a). CRUD lands in subsequent slices.
 *
 * AUTHZ: site_theme_presets is NOT tenant-scoped. Reads are gated by
 * requirePlatformAdmin(). The admin Supabase client used here bypasses
 * RLS by design — the table holds no community-scoped data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

interface SiteThemePresetRow {
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

export async function GET(_request: NextRequest) {
  await requirePlatformAdmin();

  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('site_theme_presets')
    .select(
      'id, slug, display_name, description, tokens, tier, is_archived, is_featured, version, created_at, updated_at',
    )
    .order('is_featured', { ascending: false })
    .order('display_name', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 500 },
    );
  }

  const presets = (data ?? []).map((row: SiteThemePresetRow) => ({
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    tokens: row.tokens,
    tier: row.tier,
    isArchived: row.is_archived,
    isFeatured: row.is_featured,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({ presets });
}
