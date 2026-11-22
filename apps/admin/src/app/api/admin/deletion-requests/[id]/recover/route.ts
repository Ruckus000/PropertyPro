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
 * The request row's status is the lock between this route and the purge cron:
 * whoever moves a request out of `soft_deleted` first wins. This route claims
 * `soft_deleted` → `recovered` with `recovered_at` null and stamps
 * `recovered_at` only when the recovery has finished; the purge claims
 * `soft_deleted` → `purged`. A request any purge has claimed can no longer be
 * recovered: 409. The database side is `claimDeletionRecoveryOp` and friends in
 * `packages/db/src/ops/deletion-request-ops.ts`.
 *
 * ## The order
 *
 * 1. Claim, in one transaction, every request of the target: cancel the
 *    `cooling` ones, claim the `soft_deleted` ones. Refused, writing nothing,
 *    when the target is not deleted (a stale row: recovering it must not cancel
 *    a newer live request) or when the user was soft-deleted moments ago (the
 *    cron's ban may still be in flight).
 *    A community is restored and finished in that same transaction: done.
 * 2. For a user: lift the sign-in ban, then restore the row and stamp
 *    `recovered_at`, all while holding the user's rows locked
 *    (`completeUserRecoveryOp`). A second recovery of the same account waits
 *    there and then changes nothing, so the ban always matches the final
 *    state.
 *
 * A failed unban re-applies the ban and then gives the claim back
 * (`soft_deleted` again, so the account is deleted, banned and purgeable
 * exactly as before). A crash, a failed restore, or a failure to re-apply the
 * ban leaves the requests `recovered` with a null `recovered_at`: the account
 * stays deleted, the purge never touches it, the Dashboard shows the recovery
 * as unfinished, the lifecycle cron reports it every night, and recovering the
 * same request again resumes it.
 */
import { createElement } from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { AccountRecoveredEmail, sendEmail } from '@propertypro/email';
import { formatErrorForLog } from '@propertypro/shared/observability';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
// AUTHZ: platform-admin-only recovery (requirePlatformAdmin is the first call in POST); the ops act on the request's own target only.
import { claimDeletionRecoveryOp, completeUserRecoveryOp } from '@propertypro/db/unsafe';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * The lifecycle cron's soft-delete ban (`PERMANENT_BAN` in apps/web
 * account-lifecycle-service.ts): ~100 years. Re-applied before a claim is
 * given back, so a released account is never purgeable while it can sign in.
 */
const SOFT_DELETE_BAN = '876600h';

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
async function sendRecoveredEmail(requestId: number, userId: string): Promise<void> {
  try {
    const { data: user, error } = await createAdminTypedClient()
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

function conflict(code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: 409 });
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

  // 1. The claim (see "The lock" above).
  const claim = await claimDeletionRecoveryOp(requestId, { adminUserId: admin.id });

  /** Audits a refused or failed recovery. Never replaces the response. */
  const auditFailure = (
    communityId: number | null,
    metadata: Record<string, unknown>,
  ) =>
    logAdminAction({
      admin,
      action: 'deletion_request_recover_failed',
      resourceType: 'account_deletion_request',
      resourceId: requestId,
      communityId,
      metadata,
      bestEffort: true,
    });

  switch (claim.outcome) {
    case 'not_found':
    case 'not_recoverable':
      return NextResponse.json({ error: { message: 'Request not found or not in soft_deleted status' } }, { status: 404 });
    case 'purged':
      // A purge claimed it first: finished, or failing part way and retried
      // nightly. Either way the data may already be gone.
      await auditFailure(claim.request.communityId, { stage: 'claim', code: 'ALREADY_PURGED', completed: [] });
      return conflict('ALREADY_PURGED', 'This request is being purged or has been purged, so it can no longer be recovered.');
    case 'stale':
      return conflict(
        'NOT_DELETED',
        claim.request.requestType === 'community'
          ? 'This community is not deleted, so there is nothing to recover. The request is left over from an earlier deletion.'
          : 'This account is not deleted, so there is nothing to recover. The request is left over from an earlier deletion.',
      );
    case 'target_missing':
      return conflict(
        'TARGET_MISSING',
        claim.request.requestType === 'community'
          ? 'The community this request names no longer exists, so it cannot be recovered.'
          : 'The account this request names no longer exists, so it cannot be recovered.',
      );
    case 'too_recent':
      return conflict(
        'RECENTLY_DELETED',
        `This account was deleted moments ago and its sign-in ban may still be landing. Try again after ${claim.retryAfter.toISOString()}.`,
      );
    case 'recovered': {
      await logAdminAction({
        admin,
        action: 'deletion_request_recovered',
        resourceType: 'account_deletion_request',
        resourceId: requestId,
        communityId: claim.communityId,
        oldValues: { status: claim.resumed ? 'recovered' : 'soft_deleted' },
        newValues: {
          status: 'recovered',
          request_type: 'community',
          restored_user_id: claim.request.userId,
          restored_community_id: claim.communityId,
          recovered_request_ids: claim.claimedRequestIds,
          cancelled_request_ids: claim.cancelledRequestIds,
          resumed: claim.resumed,
        },
        // The recovery has committed; an audit outage must not turn it into a
        // 500 the operator would read as "not recovered".
        bestEffort: true,
      });
      return NextResponse.json({ request: claim.request });
    }
    case 'claimed':
      break;
  }

  const { userId, claimedRequestIds, cancelledRequestIds } = claim;
  const completed = ['claim'];
  const failureMetadata = (stage: string, code: string, extra: Record<string, unknown> = {}) => ({
    stage,
    code,
    completed,
    request_type: 'user',
    claimed_request_ids: claimedRequestIds,
    cancelled_request_ids: cancelledRequestIds,
    resumed: claim.resumed,
    ...extra,
  });

  /** One GoTrue ban change; true on success, never throws. */
  const setBan = async (ban_duration: string, soft_deleted: true | null) => {
    try {
      const { error } = await createAdminTypedClient().auth.admin.updateUserById(userId, {
        ban_duration,
        user_metadata: { soft_deleted },
      });
      return !error;
    } catch {
      return false;
    }
  };

  // 2 + 3. Lift the ban, then restore and finish, under the user's row locks
  // (see completeUserRecoveryOp). The lifecycle cron banned the login at soft
  // delete; without lifting it the user is "recovered" but cannot sign in.
  const recoveredAt = new Date();
  let completion: Awaited<ReturnType<typeof completeUserRecoveryOp>>;
  try {
    completion = await completeUserRecoveryOp(
      userId,
      {
        liftBan: () => setBan('none', null),
        reapplyBan: () => setBan(SOFT_DELETE_BAN, true),
      },
      { now: recoveredAt },
    );
  } catch (err) {
    console.error(`[deletion-requests] finishing recovery of request ${requestId} failed`, {
      err: formatErrorForLog(err),
    });
    await auditFailure(null, failureMetadata('restore_user', 'USER_RESTORE_FAILED'));
    return NextResponse.json(
      {
        error: {
          code: 'USER_RESTORE_FAILED',
          message: 'Restoring the account failed. It still reads deleted and shows as an unfinished recovery; retry the recovery.',
        },
      },
      { status: 500 },
    );
  }

  if (completion.outcome === 'not_claimed') {
    // Another attempt on the same account finished this recovery, or gave it
    // back, while this one waited. That attempt made the ban match; this one
    // changed nothing.
    return conflict(
      'RECOVERY_CONCURRENT',
      'Another recovery of this account finished or was undone while this one waited. Reload to see where it stands.',
    );
  }
  if (completion.outcome === 'purged') {
    await auditFailure(null, failureMetadata('restore_user', 'ALREADY_PURGED'));
    return conflict('ALREADY_PURGED', 'This account’s data has already been purged, so it cannot be recovered.');
  }
  if (completion.outcome === 'unban_failed') {
    await auditFailure(
      null,
      failureMetadata('unban_user', 'USER_UNBAN_FAILED', {
        ban_reapplied: completion.banReapplied,
        claim_released: completion.released,
        released_request_ids: completion.releasedRequestIds,
      }),
    );
    return NextResponse.json(
      {
        error: {
          code: 'USER_UNBAN_FAILED',
          message: completion.released
            ? 'Lifting the sign-in ban failed. Nothing was restored; retry the recovery.'
            : 'Lifting the sign-in ban failed, and the recovery could not be undone. The account is still deleted and shows as an unfinished recovery; retry the recovery.',
        },
      },
      { status: 500 },
    );
  }
  const finished = completion;
  completed.push('unban_user', 'restore_user');

  await logAdminAction({
    admin,
    action: 'deletion_request_recovered',
    resourceType: 'account_deletion_request',
    resourceId: requestId,
    // Null for a user-type request: account_deletion_requests.community_id is
    // only populated for community deletions. This is exactly why the audit
    // table's community_id had to be nullable.
    communityId: null,
    oldValues: { status: claim.resumed ? 'recovered' : 'soft_deleted' },
    newValues: {
      status: 'recovered',
      request_type: 'user',
      restored_user_id: userId,
      restored_community_id: null,
      recovered_request_ids: finished.finishedRequestIds,
      cancelled_request_ids: cancelledRequestIds,
      resumed: claim.resumed,
    },
    // See the community case above.
    bestEffort: true,
  });

  await sendRecoveredEmail(requestId, userId);

  return NextResponse.json({ request: { ...claim.request, recoveredAt } });
});
