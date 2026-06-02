/**
 * POST /api/admin/site-templates/starter-packs/[slug]/new-version
 * Creates the next version (version+1) from an existing base pack. The new
 * slug is a derived human label (baseSlug -vN); the version integer is the
 * ordering authority. Base is left as-is. Blocks default to the base's,
 * re-validated; the body may override displayName/description/blocks.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { validateStarterPackBlocks } from '@propertypro/shared';
import { PACK_COLUMNS, StarterPackRow, baseSlug, shapePack, validationErrorResponse, zodErrorResponse } from '../../_shared';

const bodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  blocks: z.unknown().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  await requirePlatformAdmin();
  const { slug } = await context.params;
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: { message: 'Invalid starter pack slug' } }, { status: 400 });
  }
  let json: unknown = {};
  try { json = await request.json(); } catch { /* empty body allowed */ }
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const db = createAdminTypedClient();
  const { data: baseData, error: readErr } = await db.from('site_starter_packs').select(PACK_COLUMNS).eq('slug', slug).single();
  if (readErr) {
    if (readErr.code === 'PGRST116') return NextResponse.json({ error: { message: `Starter pack not found: ${slug}` } }, { status: 404 });
    return NextResponse.json({ error: { message: readErr.message } }, { status: 500 });
  }
  const base = baseData as StarterPackRow;

  const newVersion = base.version + 1;
  const newSlug = `${baseSlug(base.slug)}-v${newVersion}`;
  const sourceBlocks = body.blocks !== undefined ? body.blocks : base.blocks;
  const blocks = validateStarterPackBlocks(sourceBlocks);
  if (!blocks.ok) return validationErrorResponse(blocks.fields);

  const { data, error } = await db
    .from('site_starter_packs')
    .insert({
      slug: newSlug,
      display_name: body.displayName ?? base.display_name,
      community_type: base.community_type,
      description: body.description !== undefined ? body.description : base.description,
      blocks: blocks.data, version: newVersion, is_archived: false,
    })
    .select(PACK_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: { message: `Version slug already exists: ${newSlug}` } }, { status: 409 });
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ pack: shapePack(data as StarterPackRow) }, { status: 201 });
}
