/**
 * Theme Presets API for the platform admin console.
 *
 * GET  /api/admin/site-templates/theme-presets — list all theme presets.
 * POST /api/admin/site-templates/theme-presets — create a new preset.
 *
 * PATCH /[slug] and DELETE /[slug] live in the dynamic route file.
 *
 * AUTHZ: site_theme_presets is NOT tenant-scoped. Mutations are gated by
 * requirePlatformAdmin(). The admin Supabase client used here bypasses
 * RLS by design — the table holds no community-scoped data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { PLATFORM_LIST_LIMIT } from '@/lib/api/list-limits';

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

export const GET = withAdminErrorHandler(async (_request: NextRequest) => {
  await requirePlatformAdmin();

  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('site_theme_presets')
    .select(
      'id, slug, display_name, description, tokens, tier, is_archived, is_featured, version, created_at, updated_at',
    )
    .order('is_featured', { ascending: false })
    .order('display_name', { ascending: true })
    .limit(PLATFORM_LIST_LIMIT);

  assertNoDbError(error, 'Failed to read theme presets');

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
});

// ---------------------------------------------------------------------------
// POST — create a new theme preset
// ---------------------------------------------------------------------------

const tokensSchema = z.object({
  primaryColor: z.string().min(1),
  secondaryColor: z.string().min(1),
  accentColor: z.string().min(1),
  headingFont: z.string().min(1),
  bodyFont: z.string().min(1),
});

const postBodySchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'slug must be kebab-case ([a-z0-9-])'),
  displayName: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  tokens: tokensSchema,
  tier: z.enum(['essentials', 'professional', 'pm']).default('essentials'),
  isFeatured: z.boolean().default(false),
});

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

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: 'Body must be valid JSON' } },
      { status: 400 },
    );
  }

  const parsed = postBodySchema.safeParse(json);
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
  const { data, error } = await db
    .from('site_theme_presets')
    .insert({
      slug: body.slug,
      display_name: body.displayName,
      description: body.description ?? null,
      tokens: body.tokens,
      tier: body.tier,
      is_featured: body.isFeatured,
      is_archived: false,
      version: 1,
    })
    .select(
      'id, slug, display_name, description, tokens, tier, is_archived, is_featured, version, created_at, updated_at',
    )
    .single();

  if (error) {
    // 23505 = unique_violation (Postgres). The slug column is UNIQUE.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: { message: `Theme preset slug already exists: ${body.slug}` } },
        { status: 409 },
      );
    }
    assertNoDbError(error, 'Failed to create theme preset');
  }

  return NextResponse.json(
    { preset: shape(data as SiteThemePresetRow) },
    { status: 201 },
  );
});
