/**
 * Recover a soft-deleted account/community.
 *
 * POST /api/admin/deletion-requests/[id]/recover
 *
 * A recovered USER account also gets the "account restored" email. A community
 * recovery sends nothing: the request row names who asked for the deletion, not
 * who should hear that the association is back.
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
  const recoveredAt = new Date().toISOString();

  // Mark the request as recovered, conditional on still being soft_deleted.
  const { data, error } = await (db
    .from('account_deletion_requests'))
    .update({
      status: 'recovered',
      recovered_at: recoveredAt,
    })
    .eq('id', requestId)
    .eq('status', 'soft_deleted')
    .select()
    .single();

  assertNoDbError(error, 'Failed to mark deletion request recovered');

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

  // Every request this call recovered; recorded in the audit row.
  const recoveredRequestIds = [requestId];

  if (requestRow.request_type === 'user' && requestRow.user_id) {
    // Duplicate requests for one user expire together, so one cron run
    // soft-deletes all of them. Recover them all: a duplicate left
    // soft_deleted on a restored account would reach the purge, which scrubs
    // the account's PII. Same guard as above (still soft_deleted). Done before
    // the user is restored, so a failure leaves the account consistently
    // deleted rather than open with a purge pending.
    const { data: siblings, error: siblingError } = await (db
      .from('account_deletion_requests'))
      .update({ status: 'recovered', recovered_at: recoveredAt })
      .eq('user_id', requestRow.user_id)
      .eq('request_type', 'user')
      .eq('status', 'soft_deleted')
      .select('id');

    if (siblingError) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_RECOVER_FAILED',
            message: 'Request marked recovered, but this user’s other deleted requests could not be, so the account was not restored. Recover one of those requests to finish.',
          },
          request: data,
        },
        { status: 500 },
      );
    }
    for (const sibling of (siblings ?? []) as { id: number }[]) {
      recoveredRequestIds.push(sibling.id);
    }

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
            message: 'Request marked recovered, but clearing the user\u2019s deletion flag failed. Retry or clear it manually.',
          },
          request: data,
        },
        { status: 500 },
      );
    }

    // The lifecycle cron banned the login at soft delete (876600h). Without
    // this the user is "recovered" but still cannot sign in.
    const { error: unbanError } = await db.auth.admin.updateUserById(requestRow.user_id, {
      ban_duration: 'none',
      user_metadata: { soft_deleted: null },
    });

    if (unbanError) {
      return NextResponse.json(
        {
          error: {
            code: 'USER_UNBAN_FAILED',
            message: 'Request marked recovered, but lifting the sign-in ban failed. Retry or unban the user in Supabase Auth.',
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
            message: 'Request marked recovered, but clearing the community\u2019s deletion flag failed. Retry or clear it manually.',
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
      recovered_request_ids: recoveredRequestIds,
    },
  });

  if (requestRow.request_type === 'user' && requestRow.user_id) {
    await sendRecoveredEmail(db, requestId, requestRow.user_id);
  }

  return NextResponse.json({ request: data });
});
