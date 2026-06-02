/**
 * Starter Packs admin API (collection).
 *
 * GET  /api/admin/site-templates/starter-packs — list (optional ?communityType=).
 * POST — create the FIRST pack for a community type (409 if one already exists
 *        non-archived; further versions go through [slug]/new-version).
 *
 * AUTHZ: requirePlatformAdmin gates the route; site_starter_packs is not
 * tenant-scoped. The admin middleware is the real gate; this in-handler call
 * is defense-in-depth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { validateStarterPackBlocks } from '@propertypro/shared';
import {
  PACK_COLUMNS, StarterPackRow, communityTypeSchema, shapePack, validationErrorResponse, zodErrorResponse,
} from './_shared';

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();
  const ct = new URL(request.url).searchParams.get('communityType');
  let communityType: z.infer<typeof communityTypeSchema> | null = null;
  if (ct) {
    const parsed = communityTypeSchema.safeParse(ct);
    if (!parsed.success) return NextResponse.json({ error: { message: `Invalid communityType: ${ct}` } }, { status: 400 });
    communityType = parsed.data;
  }
  const db = createAdminTypedClient();
  let query = db.from('site_starter_packs').select(PACK_COLUMNS);
  if (communityType) query = query.eq('community_type', communityType);
  const { data, error } = await query.order('community_type', { ascending: true }).order('version', { ascending: false });
  if (error) return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  return NextResponse.json({ packs: (data ?? []).map((r) => shapePack(r as StarterPackRow)) });
}

const postBodySchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'slug must be kebab-case ([a-z0-9-])'),
  displayName: z.string().min(1).max(120),
  communityType: communityTypeSchema,
  description: z.string().max(2000).nullable().optional(),
  blocks: z.unknown(),
});

export async function POST(request: NextRequest) {
  await requirePlatformAdmin();
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: { message: 'Body must be valid JSON' } }, { status: 400 }); }
  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const blocks = validateStarterPackBlocks(body.blocks);
  if (!blocks.ok) return validationErrorResponse(blocks.fields);

  const db = createAdminTypedClient();

  // One non-archived lineage per community type — further versions via new-version.
  const { count, error: countErr } = await db
    .from('site_starter_packs')
    .select('id', { count: 'exact', head: true })
    .eq('community_type', body.communityType)
    .eq('is_archived', false);
  if (countErr) return NextResponse.json({ error: { message: countErr.message } }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: { message: `A starter pack already exists for ${body.communityType}; use "Save as new version" instead.` } },
      { status: 409 },
    );
  }

  const { data, error } = await db
    .from('site_starter_packs')
    .insert({
      slug: body.slug, display_name: body.displayName, community_type: body.communityType,
      description: body.description ?? null, blocks: blocks.data, version: 1, is_archived: false,
    })
    .select(PACK_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: { message: `Starter pack slug already exists: ${body.slug}` } }, { status: 409 });
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ pack: shapePack(data as StarterPackRow) }, { status: 201 });
}
