/**
 * Reset-to-starter destructive action.
 *
 * POST /api/admin/site-templates/communities/[id]/reset-to-starter
 *
 * Applies a starter pack to an existing community: soft-deletes the
 * community's current published site blocks, inserts new draft rows
 * from the pack, and emits a `site_reset_to_starter` audit log entry
 * carrying the snapshotted block IDs.
 *
 * Confirm-by-slug guard: the body must echo the community's slug. This
 * mirrors the deletion-requests confirmation UX — a destructive button
 * isn't enabled until the admin types the slug.
 *
 * Spec §5.6:
 *   1. Snapshot: soft-delete current published rows (deleted_at = now())
 *   2. Apply: insert new is_draft=true rows from pack.blocks
 *   3. Audit: log site_reset_to_starter with snapshot block IDs
 *   4. The PM publishes the drafts after review (NOT auto-published)
 *
 * The 30-day soft-delete retention is handled by the existing
 * cleanupSoftDeletedSiteBlocks cron step (PR #8d). Within that window
 * the snapshot is restorable via POST .../restore-from-snapshot.
 *
 * AUTHZ: requirePlatformAdmin. site_blocks IS tenant-scoped at the
 * RLS layer, but the admin Supabase client bypasses RLS by design —
 * platform admins act across tenants.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

const bodySchema = z.object({
  starterPackSlug: z.string().min(1).max(120),
  confirmCommunitySlug: z.string().min(1).max(240),
});

interface StarterPackBlock {
  blockType: string;
  blockOrder: number;
  content?: Record<string, unknown>;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requirePlatformAdmin();

  const { id: rawId } = await context.params;
  const communityId = Number(rawId);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { message: 'Invalid community id' } },
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

  const parsed = bodySchema.safeParse(json);
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

  const { starterPackSlug, confirmCommunitySlug } = parsed.data;
  const db = createAdminTypedClient();

  // 1. Verify community + slug match (confirm-by-slug guard)
  const { data: community, error: commErr } = await db
    .from('communities')
    .select('id, slug, name')
    .eq('id', communityId)
    .single();
  if (commErr || !community) {
    return NextResponse.json(
      { error: { message: `Community not found: ${communityId}` } },
      { status: 404 },
    );
  }
  if ((community as { slug: string }).slug !== confirmCommunitySlug) {
    return NextResponse.json(
      { error: { message: 'confirmCommunitySlug does not match the community slug' } },
      { status: 400 },
    );
  }

  // 2. Read the starter pack
  const { data: pack, error: packErr } = await db
    .from('site_starter_packs')
    .select('slug, blocks, is_archived, community_type')
    .eq('slug', starterPackSlug)
    .single();
  if (packErr || !pack) {
    return NextResponse.json(
      { error: { message: `Starter pack not found: ${starterPackSlug}` } },
      { status: 404 },
    );
  }
  if ((pack as { is_archived: boolean }).is_archived) {
    return NextResponse.json(
      { error: { message: `Starter pack is archived: ${starterPackSlug}` } },
      { status: 400 },
    );
  }

  // 3. Snapshot: soft-delete the community's current published, non-deleted blocks
  const nowIso = new Date().toISOString();
  const { data: snapshot, error: snapErr } = await db
    .from('site_blocks')
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .eq('community_id', communityId)
    .eq('is_draft', false)
    .is('deleted_at', null)
    .select('id');
  if (snapErr) {
    return NextResponse.json(
      { error: { message: `Snapshot failed: ${snapErr.message}` } },
      { status: 500 },
    );
  }
  const snapshotBlockIds = (snapshot ?? []).map((r: { id: number }) => r.id);

  // 4. Apply: insert new draft rows from the pack
  const packBlocks = ((pack as { blocks: unknown }).blocks ?? []) as StarterPackBlock[];
  if (!Array.isArray(packBlocks)) {
    return NextResponse.json(
      { error: { message: 'Starter pack has malformed blocks payload' } },
      { status: 500 },
    );
  }
  const insertRows = packBlocks.map((b) => ({
    community_id: communityId,
    block_type: b.blockType,
    block_order: b.blockOrder,
    content: b.content ?? {},
    is_draft: true,
    published_at: null,
  }));
  if (insertRows.length > 0) {
    const { error: insErr } = await db.from('site_blocks').insert(insertRows);
    if (insErr) {
      return NextResponse.json(
        { error: { message: `Apply failed: ${insErr.message}` } },
        { status: 500 },
      );
    }
  }

  // 5. Audit log entry (resource_id is the audit entry's own provenance:
  // the starter pack slug. snapshot_block_ids in metadata so the
  // restore-from-snapshot endpoint can find the rows to un-soft-delete.)
  const { data: auditRow, error: auditErr } = await db
    .from('compliance_audit_log')
    .insert({
      user_id: admin.id,
      community_id: communityId,
      action: 'site_reset_to_starter',
      resource_type: 'site_blocks',
      resource_id: starterPackSlug,
      metadata: {
        starterPackSlug,
        snapshotBlockIds,
        appliedBlockCount: insertRows.length,
      },
    })
    .select('id, created_at')
    .single();
  if (auditErr) {
    return NextResponse.json(
      { error: { message: `Audit log failed: ${auditErr.message}` } },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      reset: {
        communityId,
        starterPackSlug,
        snapshotBlockIds,
        appliedBlockCount: insertRows.length,
        auditLogId: (auditRow as { id: number }).id,
        restoreWindowDays: 30,
        createdAt: (auditRow as { created_at: string }).created_at,
      },
    },
    { status: 201 },
  );
}
