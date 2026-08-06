/**
 * Recover a soft-deleted account/community.
 *
 * POST /api/admin/deletion-requests/[id]/recover
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAdminErrorHandler(async (_request: NextRequest, { params }: RouteParams) => {
  // The return value was previously discarded, so an un-deletion — arguably
  // the single most consequential operation in this console — recorded neither
  // who performed it nor that it happened at all.
  const admin = await requirePlatformAdmin();
  const { id } = await params;

  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: { message: 'Invalid request ID' } }, { status: 400 });
  }

  const db = createAdminTypedClient();

  // Mark the request as recovered, conditional on still being soft_deleted.
  const { data, error } = await (db
    .from('account_deletion_requests'))
    .update({
      status: 'recovered',
      recovered_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'soft_deleted')
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: { message: 'Request not found or not in soft_deleted status' } }, { status: 404 });
  }

  // Restore the deletion target. Without this, the request was marked
  // 'recovered' but the underlying user / community row still had its
  // deleted_at column set, leaving the account effectively destroyed
  // despite the admin UI showing "recovered."
  const requestRow = data as {
    request_type: 'user' | 'community';
    user_id: string | null;
    community_id: number | null;
  };

  if (requestRow.request_type === 'user' && requestRow.user_id) {
    const { error: restoreError } = await (db
      .from('users'))
      .update({ deleted_at: null })
      .eq('id', requestRow.user_id);

    if (restoreError) {
      // Surface clearly — the request status update succeeded but the user
      // was not restored. Operator must intervene.
      return NextResponse.json(
        {
          error: {
            code: 'USER_RESTORE_FAILED',
            message: `Request marked recovered but users.deleted_at clear failed: ${restoreError.message}`,
          },
          request: data,
        },
        { status: 500 },
      );
    }
  } else if (requestRow.request_type === 'community' && requestRow.community_id) {
    const { error: restoreError } = await (db
      .from('communities'))
      .update({ deleted_at: null })
      .eq('id', requestRow.community_id);

    if (restoreError) {
      return NextResponse.json(
        {
          error: {
            code: 'COMMUNITY_RESTORE_FAILED',
            message: `Request marked recovered but communities.deleted_at clear failed: ${restoreError.message}`,
          },
          request: data,
        },
        { status: 500 },
      );
    }
  }

  await logAdminAction({
    admin,
    action: 'deletion_request_recovered',
    resourceType: 'account_deletion_request',
    resourceId: requestId,
    // Null for a user-type request: account_deletion_requests.community_id is
    // only populated for community deletions. This is exactly why the audit
    // table's community_id had to be nullable.
    communityId: requestRow.community_id,
    oldValues: { status: 'soft_deleted' },
    newValues: {
      status: 'recovered',
      request_type: requestRow.request_type,
      restored_user_id: requestRow.user_id,
      restored_community_id: requestRow.community_id,
    },
  });

  return NextResponse.json({ request: data });
});
