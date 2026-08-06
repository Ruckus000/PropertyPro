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
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';

const bodySchema = z.object({
  starterPackSlug: z.string().min(1).max(120),
  confirmCommunitySlug: z.string().min(1).max(240),
});

interface StarterPackBlock {
  blockType: string;
  blockOrder: number;
  content?: Record<string, unknown>;
}

export const POST = withAdminErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
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
    .select('id, slug, name, community_type')
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

  // Type-match guard: a pack only seeds blocks meaningful for its community
  // type, so refuse to apply a pack whose community_type differs from the
  // target community's. Checked BEFORE the destructive snapshot/apply below.
  const communityType = (community as { community_type: string }).community_type;
  const packType = (pack as { community_type: string }).community_type;
  if (communityType !== packType) {
    return NextResponse.json(
      {
        error: {
          message: `Starter pack community type (${packType}) does not match the community community type (${communityType})`,
        },
      },
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
  // Phase 11b: every site_blocks row needs a page. This route writes raw SQL
  // rather than going through apps/web's site-blocks service, so it has to
  // resolve the home page itself — a NULL `page_id` here would be invisible to
  // the multi-page editor and would break 11c's `SET NOT NULL`.
  //
  // Resolved, never created: if a community has no home page it has no site
  // content either (0046 backfilled every community that had blocks), so there is
  // nothing for a reset to reset. Refusing beats inventing a page from the admin
  // app, whose writes bypass the service that owns page lifecycle.
  const { data: homePage, error: homePageErr } = await db
    .from('site_pages')
    .select('id')
    .eq('community_id', communityId)
    .eq('is_home', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (homePageErr) {
    return NextResponse.json(
      { error: { message: `Home page lookup failed: ${homePageErr.message}` } },
      { status: 500 },
    );
  }
  const homePageId = (homePage as { id: number } | null)?.id ?? null;
  if (homePageId === null && packBlocks.length > 0) {
    return NextResponse.json(
      {
        error: {
          message:
            'This community has no home page yet, so a starter pack cannot be applied. Open the website editor for the community once to create it, then retry.',
        },
      },
      { status: 409 },
    );
  }

  const insertRows = packBlocks.map((b) => ({
    community_id: communityId,
    page_id: homePageId,
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

  // The compliance_audit_log write above is KEPT rather than replaced: it is
  // the tenant-visible statutory record, and restore-from-snapshot reads that
  // row back by id to find the blocks to un-delete. Removing it would be a
  // functional regression, not just a logging change. This is the additional
  // platform-operator record.
  await logAdminAction({
    admin,
    action: 'site_template_reset',
    resourceType: 'site_blocks',
    resourceId: starterPackSlug,
    communityId,
    metadata: {
      starterPackSlug,
      snapshotBlockIds,
      appliedBlockCount: insertRows.length,
      complianceAuditLogId: (auditRow as { id?: number } | null)?.id ?? null,
    },
  });

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
});
