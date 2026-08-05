/**
 * Layout metadata mutation API.
 *
 * PATCH /api/admin/site-templates/layouts/[slug]
 *
 * Updates the editable metadata fields on a code-shipped layout row.
 * The layout React component itself ships via PR; only the catalog
 * fields below are edited from the admin UI:
 *
 *   - displayName, tagline, description
 *   - tier ('essentials' | 'professional' | 'pm')
 *   - isFeatured, isArchived
 *
 * Body fields are all optional; only the provided ones are written.
 * Unknown fields are ignored.
 *
 * AUTHZ: requirePlatformAdmin gates the route. site_layout_metadata is
 * NOT tenant-scoped — catalog data, not community-scoped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { z } from 'zod';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';

const patchBodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  tagline: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  tier: z.enum(['essentials', 'professional', 'pm']).optional(),
  isFeatured: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

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

function shape(row: SiteLayoutMetadataRow) {
  return {
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
  };
}

export const PATCH = withAdminErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) => {
  await requirePlatformAdmin();

  const { slug } = await context.params;
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json(
      { error: { message: 'Invalid layout slug' } },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: 'Body must be valid JSON' } },
      { status: 400 },
    );
  }

  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid request body',
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined) update.display_name = body.displayName;
  if (body.tagline !== undefined) update.tagline = body.tagline;
  if (body.description !== undefined) update.description = body.description;
  if (body.tier !== undefined) update.tier = body.tier;
  if (body.isFeatured !== undefined) update.is_featured = body.isFeatured;
  if (body.isArchived !== undefined) update.is_archived = body.isArchived;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: { message: 'No editable fields supplied' } },
      { status: 400 },
    );
  }
  update.updated_at = new Date().toISOString();

  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('site_layout_metadata')
    .update(update)
    .eq('slug', slug)
    .select(
      'id, slug, display_name, tagline, description, tier, is_archived, is_featured, default_preset_slug, version, created_at, updated_at',
    )
    .single();

  if (error) {
    // PGRST116 = "Results contain 0 rows" from PostgREST (.single() on empty set).
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: { message: `Layout not found: ${slug}` } },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ layout: shape(data as SiteLayoutMetadataRow) });
});
