/**
 * Layouts API for the platform admin console.
 *
 * GET /api/admin/site-templates/layouts — list code-shipped layout metadata.
 *
 * Read-only in this slice (PR #6b). PATCH (metadata edit) lands in
 * subsequent slices.
 *
 * AUTHZ: site_layout_metadata is NOT tenant-scoped. Reads are gated by
 * requirePlatformAdmin(); the admin Supabase client used here bypasses
 * RLS by design — the table holds catalog rows describing layouts that
 * ship as React components in apps/web/src/components/public-site/layouts/.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';

interface SiteLayoutMetadataRow {
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

export const GET = withAdminErrorHandler(async (_request: NextRequest) => {
  await requirePlatformAdmin();

  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('site_layout_metadata')
    .select(
      'id, slug, display_name, tagline, description, tier, is_archived, is_featured, default_preset_slug, version, created_at, updated_at',
    )
    .order('is_featured', { ascending: false })
    .order('display_name', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 500 },
    );
  }

  const layouts = (data ?? []).map((row: SiteLayoutMetadataRow) => ({
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

  return NextResponse.json({ layouts });
});
