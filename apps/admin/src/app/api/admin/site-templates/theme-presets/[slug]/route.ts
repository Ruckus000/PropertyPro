/**
 * Theme preset mutation API (per-slug).
 *
 * PATCH /api/admin/site-templates/theme-presets/[slug] — update fields.
 *
 * Editable fields: displayName, description, tokens (partial), tier,
 * isFeatured, isArchived. The slug itself is immutable (it's how
 * communities reference the preset via branding.themePresetSlug).
 *
 * Updating tokens bumps the preset's version counter so admins can
 * see how many revisions a preset has gone through. The increment is
 * done on the row via SQL math expression; if you want history /
 * rollback semantics, that's a later slice.
 *
 * AUTHZ: requirePlatformAdmin gates the route. site_theme_presets is
 * NOT tenant-scoped — catalog data, not community-scoped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

const tokensSchema = z.object({
  primaryColor: z.string().min(1),
  secondaryColor: z.string().min(1),
  accentColor: z.string().min(1),
  headingFont: z.string().min(1),
  bodyFont: z.string().min(1),
});

const patchBodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  tokens: tokensSchema.optional(),
  tier: z.enum(['essentials', 'professional', 'pm']).optional(),
  isFeatured: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

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

function shape(row: SiteThemePresetRow) {
  return {
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
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  await requirePlatformAdmin();

  const { slug } = await context.params;
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json(
      { error: { message: 'Invalid preset slug' } },
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
  const db = createAdminTypedClient();

  // If tokens are being changed, fetch the current version so we can bump it.
  let nextVersion: number | undefined;
  if (body.tokens !== undefined) {
    const { data: existing, error: readErr } = await db
      .from('site_theme_presets')
      .select('version')
      .eq('slug', slug)
      .single();
    if (readErr) {
      if (readErr.code === 'PGRST116') {
        return NextResponse.json(
          { error: { message: `Theme preset not found: ${slug}` } },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: { message: readErr.message } },
        { status: 500 },
      );
    }
    nextVersion = (existing as { version: number }).version + 1;
  }

  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined) update.display_name = body.displayName;
  if (body.description !== undefined) update.description = body.description;
  if (body.tokens !== undefined) {
    update.tokens = body.tokens;
    update.version = nextVersion;
  }
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

  const { data, error } = await db
    .from('site_theme_presets')
    .update(update)
    .eq('slug', slug)
    .select(
      'id, slug, display_name, description, tokens, tier, is_archived, is_featured, version, created_at, updated_at',
    )
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: { message: `Theme preset not found: ${slug}` } },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: { message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ preset: shape(data as SiteThemePresetRow) });
}
