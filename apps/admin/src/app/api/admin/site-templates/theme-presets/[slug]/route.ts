/**
 * Theme preset mutation API (per-slug).
 *
 * PATCH  /api/admin/site-templates/theme-presets/[slug] — update fields.
 * DELETE /api/admin/site-templates/theme-presets/[slug] — remove or archive.
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
 * DELETE is usage-aware: a preset that any community references (via
 * branding.themePresetSlug) or that a layout names as its
 * default_preset_slug (FK onDelete:restrict) is ARCHIVED (is_archived=true)
 * rather than hard-deleted, so live sites keep resolving their tokens.
 * Only a fully-unreferenced preset is hard-deleted.
 *
 * AUTHZ: requirePlatformAdmin gates the route. site_theme_presets is
 * NOT tenant-scoped — catalog data, not community-scoped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';

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

export const PATCH = withAdminErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) => {
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
});

export const DELETE = withAdminErrorHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) => {
  await requirePlatformAdmin();

  const { slug } = await context.params;
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json(
      { error: { message: 'Invalid preset slug' } },
      { status: 400 },
    );
  }

  const db = createAdminTypedClient();

  // Confirm the preset exists (and learn its current archive state for
  // idempotency on the archive branch).
  const { data: preset, error: readErr } = await db
    .from('site_theme_presets')
    .select('id, is_archived')
    .eq('slug', slug)
    .single();
  if (readErr) {
    if (readErr.code === 'PGRST116') {
      return NextResponse.json(
        { error: { message: `Theme preset not found: ${slug}` } },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: { message: readErr.message } }, { status: 500 });
  }

  // Usage check 1 — non-deleted communities referencing this preset via the
  // branding jsonb. head:true keeps it a COUNT, no rows transferred.
  const { count: communityCount, error: cErr } = await db
    .from('communities')
    .select('id', { count: 'exact', head: true })
    .filter('branding->>themePresetSlug', 'eq', slug)
    .is('deleted_at', null);
  if (cErr) {
    return NextResponse.json({ error: { message: cErr.message } }, { status: 500 });
  }

  // Usage check 2 — layouts that name this preset as their default. The FK
  // is onDelete:restrict, so a hard delete here would error at the DB anyway.
  const { count: layoutCount, error: lErr } = await db
    .from('site_layout_metadata')
    .select('slug', { count: 'exact', head: true })
    .eq('default_preset_slug', slug);
  if (lErr) {
    return NextResponse.json({ error: { message: lErr.message } }, { status: 500 });
  }

  const communities = communityCount ?? 0;
  const layouts = layoutCount ?? 0;

  if (communities > 0 || layouts > 0) {
    // In use → archive instead of delete so live sites keep resolving tokens.
    if (!(preset as { is_archived: boolean }).is_archived) {
      const { error: archiveErr } = await db
        .from('site_theme_presets')
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq('slug', slug);
      if (archiveErr) {
        return NextResponse.json({ error: { message: archiveErr.message } }, { status: 500 });
      }
    }
    return NextResponse.json({
      archived: true,
      deleted: false,
      communityCount: communities,
      layoutCount: layouts,
    });
  }

  // Fully unreferenced → hard delete.
  const { error: delErr } = await db
    .from('site_theme_presets')
    .delete()
    .eq('slug', slug);
  if (delErr) {
    return NextResponse.json({ error: { message: delErr.message } }, { status: 500 });
  }

  return NextResponse.json({ archived: false, deleted: true });
});
