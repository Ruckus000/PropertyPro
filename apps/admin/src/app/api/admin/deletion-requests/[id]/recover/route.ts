/**
 * Recover a soft-deleted account/community.
 *
 * POST /api/admin/deletion-requests/[id]/recover
 *
 * A recovered USER account also gets the "account restored" email. A community
 * recovery sends nothing: the request row names who asked for the deletion, not
 * who should hear that the association is back.
 *
 * Recovering a user also recovers every other `soft_deleted` request of that
 * user and cancels any still `cooling`, so no leftover request can purge or
 * re-delete the restored account. The steps run in a retryable order; see the
 * comment in POST.
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

  // Read, don't write: the request is flipped LAST (see the order below).
  const { data: found, error: findError } = await (db
    .from('account_deletion_requests'))
    .select('*')
    .eq('id', requestId)
    .eq('status', 'soft_deleted')
    .maybeSingle();

  assertNoDbError(findError, 'Failed to load deletion request');

  if (!found) {
    return NextResponse.json({ error: { message: 'Request not found or not in soft_deleted status' } }, { status: 404 });
  }

  const requestRow = found as {
    request_type: 'user' | 'community';
    user_id: string | null;
    community_id: number | null;
  };

  // Order: restore the target, lift the ban, cancel pending requests, and only
  // then mark the request recovered. This call is not one transaction, so the
  // order is what makes a partial failure retryable: until the last step the
  // request is still `soft_deleted`, so the operator can run the same recovery
  // again, and every step before it is safe to repeat. (Flipping the request
  // first, as this route used to, meant a later failure left it `recovered`, a
  // retry answered 404, and the account stayed deleted and banned.) Meanwhile
  // the purge cannot touch the account, because it requires `users.deleted_at`
  // to be set and the first step clears it.
  const completed: string[] = [];
  /** Audits a recovery that stopped part way, then answers 500. */
  async function fail(stage: string, code: string, message: string) {
    await logAdminAction({
      admin,
      action: 'deletion_request_recover_failed',
      resourceType: 'account_deletion_request',
      resourceId: requestId,
      communityId: requestRow.community_id,
      metadata: { stage, code, completed, request_type: requestRow.request_type },
      // The 500 below is the signal that matters; an audit outage must not
      // replace it with a different error.
      bestEffort: true,
    });
    return NextResponse.json(
      { error: { code, message: `${message} The request is still deleted, so retry the recovery to finish.` }, request: found },
      { status: 500 },
    );
  }

  const recoveredRequestIds: number[] = [];
  const cancelledRequestIds: number[] = [];

  if (requestRow.request_type === 'user' && requestRow.user_id) {
    const userId = requestRow.user_id;

    const { error: restoreError } = await (db
      .from('users'))
      .update({ deleted_at: null })
      .eq('id', userId);
    if (restoreError) {
      return fail('restore_user', 'USER_RESTORE_FAILED', 'Clearing the user’s deletion flag failed.');
    }
    completed.push('restore_user');

    // The lifecycle cron banned the login at soft delete (876600h). Without
    // this the user is "recovered" but still cannot sign in.
    const { error: unbanError } = await db.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
      user_metadata: { soft_deleted: null },
    });
    if (unbanError) {
      return fail('unban_user', 'USER_UNBAN_FAILED', 'Lifting the sign-in ban failed.');
    }
    completed.push('unban_user');

    // A request still cooling would delete the restored account again at the
    // end of its cooling period.
    const { data: cancelled, error: cancelError } = await (db
      .from('account_deletion_requests'))
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by: admin.id })
      .eq('user_id', userId)
      .eq('request_type', 'user')
      .eq('status', 'cooling')
      .select('id');
    if (cancelError) {
      return fail('cancel_cooling', 'COOLING_CANCEL_FAILED', 'Cancelling the user’s pending deletion requests failed.');
    }
    for (const row of (cancelled ?? []) as { id: number }[]) cancelledRequestIds.push(row.id);
    completed.push('cancel_cooling');

    // Every soft_deleted request of the user, this one included. Duplicates
    // expire together, so one cron run soft-deletes all of them, and one left
    // soft_deleted would be purged if the account were ever deleted again.
    const { data: recovered, error: recoverError } = await (db
      .from('account_deletion_requests'))
      .update({ status: 'recovered', recovered_at: now })
      .eq('user_id', userId)
      .eq('request_type', 'user')
      .eq('status', 'soft_deleted')
      .select('id');
    if (recoverError) {
      return fail('mark_recovered', 'REQUESTS_UPDATE_FAILED', 'Marking the user’s deletion requests recovered failed.');
    }
    for (const row of (recovered ?? []) as { id: number }[]) recoveredRequestIds.push(row.id);
  } else if (requestRow.request_type === 'community' && requestRow.community_id) {
    const { error: restoreError } = await (db
      .from('communities'))
      .update({ deleted_at: null })
      .eq('id', requestRow.community_id);
    if (restoreError) {
      return fail('restore_community', 'COMMUNITY_RESTORE_FAILED', 'Clearing the community’s deletion flag failed.');
    }
    completed.push('restore_community');

    const { data: recovered, error: recoverError } = await (db
      .from('account_deletion_requests'))
      .update({ status: 'recovered', recovered_at: now })
      .eq('id', requestId)
      .eq('status', 'soft_deleted')
      .select('id');
    if (recoverError) {
      return fail('mark_recovered', 'REQUESTS_UPDATE_FAILED', 'Marking the deletion request recovered failed.');
    }
    for (const row of (recovered ?? []) as { id: number }[]) recoveredRequestIds.push(row.id);
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

  return NextResponse.json({ request: { ...found, status: 'recovered', recovered_at: now } });
});
