/**
 * Starter Packs admin API (per-slug).
 * PATCH  — in-place edit (displayName, description, blocks, isArchived). slug
 *          AND community_type are immutable; version unchanged (versioning is
 *          explicit via new-version).
 * DELETE — archive (is_archived=true). 409 if it is the last non-archived pack
 *          for its community_type (would leave new communities empty).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { validateStarterPackBlocks } from '@propertypro/shared';
import { PACK_COLUMNS, StarterPackRow, shapePack, validationErrorResponse, zodErrorResponse } from '../_shared';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';

const patchBodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  blocks: z.unknown().optional(),
  isArchived: z.boolean().optional(),
});

export const PATCH = withAdminErrorHandler(async (request: NextRequest, context: { params: Promise<{ slug: string }> }) => {
  await requirePlatformAdmin();
  const { slug } = await context.params;
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: { message: 'Invalid starter pack slug' } }, { status: 400 });
  }
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: { message: 'Body must be valid JSON' } }, { status: 400 }); }
  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined) update.display_name = body.displayName;
  if (body.description !== undefined) update.description = body.description;
  if (body.isArchived !== undefined) update.is_archived = body.isArchived;
  if (body.blocks !== undefined) {
    const blocks = validateStarterPackBlocks(body.blocks);
    if (!blocks.ok) return validationErrorResponse(blocks.fields);
    update.blocks = blocks.data;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: { message: 'No editable fields supplied' } }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const db = createAdminTypedClient();
  const { data, error } = await db.from('site_starter_packs').update(update).eq('slug', slug).select(PACK_COLUMNS).single();
  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: { message: `Starter pack not found: ${slug}` } }, { status: 404 });
    assertNoDbError(error, 'Failed to update starter pack');
  }
  return NextResponse.json({ pack: shapePack(data as StarterPackRow) });
});

export const DELETE = withAdminErrorHandler(async (_request: NextRequest, context: { params: Promise<{ slug: string }> }) => {
  await requirePlatformAdmin();
  const { slug } = await context.params;
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: { message: 'Invalid starter pack slug' } }, { status: 400 });
  }
  const db = createAdminTypedClient();

  const { data: pack, error: readErr } = await db
    .from('site_starter_packs').select('id, community_type, is_archived').eq('slug', slug).single();
  if (readErr) {
    if (readErr.code === 'PGRST116') return NextResponse.json({ error: { message: `Starter pack not found: ${slug}` } }, { status: 404 });
    assertNoDbError(readErr, 'Failed to read starter pack');
  }
  const row = pack as { id: number; community_type: StarterPackRow['community_type']; is_archived: boolean };

  if (row.is_archived) {
    // Already archived — idempotent no-op.
    return NextResponse.json({ archived: true, deleted: false });
  }

  // Refuse to archive the LAST non-archived pack for the type.
  const { count, error: cErr } = await db
    .from('site_starter_packs').select('id', { count: 'exact', head: true })
    .eq('community_type', row.community_type).eq('is_archived', false).neq('id', row.id);
  assertNoDbError(cErr, 'Failed to count sibling starter packs');
  if ((count ?? 0) === 0) {
    return NextResponse.json(
      { error: { message: `Cannot archive the only starter pack for ${row.community_type}; create or unarchive a replacement first.` } },
      { status: 409 },
    );
  }

  const { error: archiveErr } = await db
    .from('site_starter_packs').update({ is_archived: true, updated_at: new Date().toISOString() }).eq('slug', slug);
  assertNoDbError(archiveErr, 'Failed to archive starter pack');
  return NextResponse.json({ archived: true, deleted: false });
});
