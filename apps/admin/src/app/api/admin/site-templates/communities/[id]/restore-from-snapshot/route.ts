/**
 * Restore-from-snapshot — reverses a recent reset-to-starter within
 * the 30-day retention window.
 *
 * POST /api/admin/site-templates/communities/[id]/restore-from-snapshot
 *
 * Body: { auditLogId, confirmCommunitySlug }
 *
 *   1. Look up the prior site_reset_to_starter audit log entry by id
 *   2. Verify the audit entry belongs to this community
 *   3. Verify the snapshot blocks are still within the 30-day window
 *      (deleted_at not yet cleaned up by the cron)
 *   4. Un-soft-delete the snapshot rows (set deleted_at = null)
 *   5. Soft-delete the post-reset rows (the draft + any other current rows
 *      for the community that didn't exist before the reset)
 *   6. Emit a site_restore_from_snapshot audit log entry
 *
 * AUTHZ: requirePlatformAdmin. Bypasses RLS via the admin client.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';

const RESTORE_WINDOW_DAYS = 30;

const bodySchema = z.object({
  auditLogId: z.number().int().positive(),
  confirmCommunitySlug: z.string().min(1).max(240),
});

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

  const { auditLogId, confirmCommunitySlug } = parsed.data;
  const db = createAdminTypedClient();

  // 1. Verify community slug matches the URL id
  const { data: community, error: commErr } = await db
    .from('communities')
    .select('id, slug')
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

  // 2. Look up the prior reset audit entry
  const { data: prior, error: priorErr } = await db
    .from('compliance_audit_log')
    .select('id, community_id, action, metadata, created_at')
    .eq('id', auditLogId)
    .single();
  if (priorErr || !prior) {
    return NextResponse.json(
      { error: { message: `Audit entry not found: ${auditLogId}` } },
      { status: 404 },
    );
  }
  const priorRow = prior as {
    id: number;
    community_id: number;
    action: string;
    metadata: { snapshotBlockIds?: number[] } | null;
    created_at: string;
  };
  if (priorRow.community_id !== communityId) {
    return NextResponse.json(
      { error: { message: 'Audit entry does not belong to this community' } },
      { status: 400 },
    );
  }
  if (priorRow.action !== 'site_reset_to_starter') {
    return NextResponse.json(
      { error: { message: 'Audit entry is not a reset-to-starter event' } },
      { status: 400 },
    );
  }
  const snapshotBlockIds = priorRow.metadata?.snapshotBlockIds ?? [];
  if (!Array.isArray(snapshotBlockIds) || snapshotBlockIds.length === 0) {
    return NextResponse.json(
      { error: { message: 'Audit entry has no snapshot blocks (nothing to restore)' } },
      { status: 400 },
    );
  }

  // 3. Window check: the audit entry must be within the retention window.
  const ageMs = Date.now() - new Date(priorRow.created_at).getTime();
  const windowMs = RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > windowMs) {
    return NextResponse.json(
      {
        error: {
          message: `Snapshot is past the ${RESTORE_WINDOW_DAYS}-day restore window (cron may have purged)`,
        },
      },
      { status: 410 },
    );
  }

  const nowIso = new Date().toISOString();

  // 4. Soft-delete current non-deleted rows for the community (the post-reset state)
  const { data: currentRows, error: currentErr } = await db
    .from('site_blocks')
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .select('id');
  if (currentErr) {
    return NextResponse.json(
      { error: { message: `Failed to retire current rows: ${currentErr.message}` } },
      { status: 500 },
    );
  }

  // 5. Un-soft-delete the snapshot rows
  const { data: restored, error: restoreErr } = await db
    .from('site_blocks')
    .update({ deleted_at: null, updated_at: nowIso })
    .in('id', snapshotBlockIds)
    .eq('community_id', communityId)
    .select('id');
  if (restoreErr) {
    return NextResponse.json(
      { error: { message: `Failed to restore snapshot: ${restoreErr.message}` } },
      { status: 500 },
    );
  }
  const restoredIds = (restored ?? []).map((r: { id: number }) => r.id);

  // 6. Audit log entry mirroring the reset
  const { data: auditRow, error: auditErr } = await db
    .from('compliance_audit_log')
    .insert({
      user_id: admin.id,
      community_id: communityId,
      action: 'site_restore_from_snapshot',
      resource_type: 'site_blocks',
      resource_id: String(auditLogId),
      metadata: {
        restoredFromAuditId: auditLogId,
        restoredBlockIds: restoredIds,
        retiredBlockIds: (currentRows ?? []).map((r: { id: number }) => r.id),
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
      restore: {
        communityId,
        restoredFromAuditId: auditLogId,
        restoredBlockIds: restoredIds,
        retiredBlockCount: (currentRows ?? []).length,
        auditLogId: (auditRow as { id: number }).id,
        createdAt: (auditRow as { created_at: string }).created_at,
      },
    },
    { status: 201 },
  );
});
