/**
 * Recover a soft-deleted account/community.
 *
 * POST /api/admin/deletion-requests/[id]/recover
 *
 * A recovered USER account also gets the "account restored" email. A community
 * recovery sends nothing: the request row names who asked for the deletion, not
 * who should hear that the association is back.
 *
 * ## The lock
 *
 * The request row's status is the lock between this route and the purge cron.
 * Each side starts by moving the request OUT of `soft_deleted` with a
 * conditional UPDATE: this route to `recovered`, the purge to `purged` (with
 * `purged_at` still null until it finishes). Postgres serialises the two on the
 * row, so exactly one wins, and neither touches the account until it has. A
 * request the purge has claimed (including one whose purge failed part way and
 * is retried nightly) can no longer be recovered: 409.
 *
 * ## The order
 *
 * 1. Claim the chosen request (`soft_deleted` → `recovered`).
 * 2. For a user: claim the user's other `soft_deleted` requests the same way
 *    (duplicates expire together, and one left behind would be purged if the
 *    account were ever deleted again), and cancel any still `cooling` (one
 *    would delete the restored account again).
 * 3. Restore the target: clear `deleted_at`. For a user only while the row has
 *    not been scrubbed, which arbitrates against a purge running on a
 *    DIFFERENT request of the same user (a duplicate): whichever of the
 *    scrub (requires `deleted_at` set) and this restore (requires the row
 *    unscrubbed) commits first wins, and the other matches nothing.
 * 4. For a user: lift the sign-in ban.
 *
 * Not one transaction. If a step after the claim fails, the route gives back
 * what it claimed (`recovered` → `soft_deleted`, only where still `recovered`),
 * so the same recovery can simply be retried, and writes a
 * `deletion_request_recover_failed` audit row naming the stage and the steps
 * completed. Cancelled `cooling` requests stay cancelled: the operator asked
 * for the account back. If giving the claim back fails too, the audit row and
 * the 500 say so: the request then reads `recovered` while the account is still
 * deleted, and an operator has to fix it by hand.
 */
import { createElement } from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { AccountRecoveredEmail, sendEmail } from '@propertypro/email';
import { formatErrorForLog } from '@propertypro/shared/observability';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { logAdminAction } from '@/lib/audit/log-admin-action';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** The web app's sign-in page, or undefined when WEB_APP_ORIGIN is unusable. */
function resolveSignInUrl(): string | undefined {
  const raw = process.env.WEB_APP_ORIGIN;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return `${url.origin}/auth/login`;
  } catch {
    return undefined;
  }
}

/** False for an empty address and for any address the purge wrote. */
function isDeliverableAddress(email: string | null | undefined): email is string {
  if (!email || !email.includes('@')) return false;
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return domain !== 'redacted' && !domain.startsWith('redacted.');
}

/**
 * Best effort: the recovery has committed and is audited by the time this
 * runs, so a lookup or delivery failure is logged and swallowed rather than
 * turning a successful recovery into a 500 the operator would retry. The
 * idempotency key makes a retried request harmless anyway.
 */
async function sendRecoveredEmail(
  db: ReturnType<typeof createAdminTypedClient>,
  requestId: number,
  userId: string,
): Promise<void> {
  try {
    const { data: user, error } = await db
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = user as { email: string | null; full_name: string | null } | null;
    if (!row || !isDeliverableAddress(row.email)) return;

    await sendEmail({
      to: row.email,
      subject: 'Your PropertyPro account has been restored',
      category: 'transactional',
      react: createElement(AccountRecoveredEmail, {
        branding: { communityName: 'PropertyPro' },
        recipientName: row.full_name?.trim() || 'there',
        portalUrl: resolveSignInUrl(),
        wasDeactivated: true,
      }),
      idempotencyKey: `account-deletion/recovered/${requestId}`,
    });
  } catch (err) {
    console.error(`[deletion-requests] recovered email for request ${requestId} failed`, {
      err: formatErrorForLog(err),
    });
  }
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
  const now = new Date().toISOString();

  // 1. The claim (see "The lock" above).
  const { data: claimed, error: claimError } = await (db
    .from('account_deletion_requests'))
    .update({ status: 'recovered', recovered_at: now })
    .eq('id', requestId)
    .eq('status', 'soft_deleted')
    .select()
    .maybeSingle();

  assertNoDbError(claimError, 'Failed to claim deletion request for recovery');

  if (!claimed) {
    const { data: current, error: readError } = await (db
      .from('account_deletion_requests'))
      .select('status, community_id')
      .eq('id', requestId)
      .maybeSingle();
    assertNoDbError(readError, 'Failed to read deletion request');
    const row = current as { status: string; community_id: number | null } | null;
    if (row?.status === 'purged') {
      // The purge claimed it first: finished, or failing part way and retried
      // nightly. Either way the data may already be gone.
      await logAdminAction({
        admin,
        action: 'deletion_request_recover_failed',
        resourceType: 'account_deletion_request',
        resourceId: requestId,
        communityId: row.community_id,
        metadata: { stage: 'claim', code: 'ALREADY_PURGED', completed: [] },
        bestEffort: true,
      });
      return NextResponse.json(
        { error: { code: 'ALREADY_PURGED', message: 'This request is being purged or has been purged, so it can no longer be recovered.' } },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: { message: 'Request not found or not in soft_deleted status' } }, { status: 404 });
  }

  const requestRow = claimed as {
    request_type: 'user' | 'community';
    user_id: string | null;
    community_id: number | null;
  };

  // Every request this call moved to `recovered`, and every one it cancelled.
  const recoveredRequestIds = [requestId];
  const cancelledRequestIds: number[] = [];
  const completed: string[] = ['claim'];

  /** Gives back what this call claimed, only where it is still `recovered`. */
  async function releaseClaim(): Promise<boolean> {
    try {
      const { error } = await (db
        .from('account_deletion_requests'))
        .update({ status: 'soft_deleted', recovered_at: null })
        .in('id', recoveredRequestIds)
        .eq('status', 'recovered');
      return !error;
    } catch {
      return false;
    }
  }

  /** Releases the claim, audits the failed stage, and answers. */
  async function fail(stage: string, code: string, message: string, status = 500) {
    const released = await releaseClaim();
    await logAdminAction({
      admin,
      action: 'deletion_request_recover_failed',
      resourceType: 'account_deletion_request',
      resourceId: requestId,
      communityId: requestRow.community_id,
      metadata: {
        stage,
        code,
        completed,
        request_type: requestRow.request_type,
        claimed_request_ids: recoveredRequestIds,
        cancelled_request_ids: cancelledRequestIds,
        claim_released: released,
      },
      // The response below is the signal that matters; an audit outage must
      // not replace it with a different error.
      bestEffort: true,
    });
    if (!released) {
      return NextResponse.json(
        {
          error: {
            code: 'RECOVERY_UNDO_FAILED',
            message: `${message} Undoing the recovery also failed: request(s) ${recoveredRequestIds.join(', ')} now read "recovered" but the account is still deleted. Fix them by hand before retrying.`,
          },
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: { code, message } }, { status });
  }

  if (requestRow.request_type === 'user' && requestRow.user_id) {
    const userId = requestRow.user_id;

    // 2. The user's other soft_deleted requests, and any still cooling.
    const { data: duplicates, error: duplicatesError } = await (db
      .from('account_deletion_requests'))
      .update({ status: 'recovered', recovered_at: now })
      .eq('user_id', userId)
      .eq('request_type', 'user')
      .eq('status', 'soft_deleted')
      .select('id');
    if (duplicatesError) {
      return fail('claim_duplicates', 'REQUESTS_UPDATE_FAILED', 'Claiming the user’s other deleted requests failed. Nothing was restored; retry the recovery.');
    }
    for (const row of (duplicates ?? []) as { id: number }[]) recoveredRequestIds.push(row.id);
    completed.push('claim_duplicates');

    const { data: cancelled, error: cancelError } = await (db
      .from('account_deletion_requests'))
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by: admin.id })
      .eq('user_id', userId)
      .eq('request_type', 'user')
      .eq('status', 'cooling')
      .select('id');
    if (cancelError) {
      return fail('cancel_cooling', 'COOLING_CANCEL_FAILED', 'Cancelling the user’s pending deletion requests failed. Nothing was restored; retry the recovery.');
    }
    for (const row of (cancelled ?? []) as { id: number }[]) cancelledRequestIds.push(row.id);
    completed.push('cancel_cooling');

    // 3. Restore, unless a purge of another request already scrubbed the row.
    const { data: restored, error: restoreError } = await (db
      .from('users'))
      .update({ deleted_at: null })
      .eq('id', userId)
      .not('email', 'like', '%@redacted')
      .select('id');
    if (restoreError) {
      return fail('restore_user', 'USER_RESTORE_FAILED', 'Clearing the user’s deletion flag failed. Nothing was restored; retry the recovery.');
    }
    if (((restored ?? []) as unknown[]).length === 0) {
      return fail(
        'restore_user',
        'ALREADY_PURGED',
        'This account’s data has already been purged (or the account no longer exists), so it cannot be recovered.',
        409,
      );
    }
    completed.push('restore_user');

    // 4. The lifecycle cron banned the login at soft delete (876600h). Without
    // this the user is "recovered" but still cannot sign in.
    const { error: unbanError } = await db.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
      user_metadata: { soft_deleted: null },
    });
    if (unbanError) {
      return fail(
        'unban_user',
        'USER_UNBAN_FAILED',
        'Lifting the sign-in ban failed. The user’s deletion flag is already cleared, but sign-in is still blocked; retry the recovery.',
      );
    }
    completed.push('unban_user');
  } else if (requestRow.request_type === 'community' && requestRow.community_id) {
    const { error: restoreError } = await (db
      .from('communities'))
      .update({ deleted_at: null })
      .eq('id', requestRow.community_id);
    if (restoreError) {
      return fail('restore_community', 'COMMUNITY_RESTORE_FAILED', 'Clearing the community’s deletion flag failed. Nothing was restored; retry the recovery.');
    }
    completed.push('restore_community');
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
      recovered_request_ids: recoveredRequestIds,
      cancelled_request_ids: cancelledRequestIds,
    },
  });

  if (requestRow.request_type === 'user' && requestRow.user_id) {
    await sendRecoveredEmail(db, requestId, requestRow.user_id);
  }

  return NextResponse.json({ request: claimed });
});
