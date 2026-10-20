/**
 * Access Request Service — admin review of resident access requests.
 *
 * Approval creates a Supabase auth user + users row + user_roles row.
 *
 * The public submit + OTP verify half was deleted on 2026-10-20 (unreachable
 * since #764), so no NEW request can be created; review of existing ones stays.
 */

import { createElement } from 'react';

import {
  createScopedClient,
  paginate,
  accessRequests,
  users,
  userRoles,
  communities,
  notificationPreferences,
  logAuditEvent,
} from '@propertypro/db';
import { eq, and } from '@propertypro/db/filters';
import {
  AccessRequestApprovedEmail,
  AccessRequestDeniedEmail,
  sendEmail,
} from '@propertypro/email';
import { createAuthUserBoundTo, findAuthAccount, rollBackAuthUser } from '@/lib/services/auth-user-binding';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { assertUnitInCommunity } from '@/lib/services/scoped-fk-validators';
import { getBaseUrl } from '@/lib/utils/url';

// ---------------------------------------------------------------------------
// approveAccessRequest
// ---------------------------------------------------------------------------

export async function approveAccessRequest(params: {
  requestId: number;
  communityId: number;
  reviewerId: string;
  unitId?: number;
}): Promise<{ userId: string }> {
  const { requestId, communityId, reviewerId, unitId } = params;
  const scoped = createScopedClient(communityId);

  // Primary-key lookup, tenant- and soft-delete-scoped.
  const request = await scoped.queryById(accessRequests, requestId);

  if (!request) {
    throw new NotFoundError('Access request not found');
  }

  if (request['status'] !== 'pending') {
    throw new ValidationError('Only pending requests can be approved.');
  }

  // Reject a foreign-tenant unit reference before any auth-user / role write.
  await assertUnitInCommunity(scoped, unitId);

  const requestEmail = (request['email'] as string).toLowerCase();
  const requestFullName = request['fullName'] as string;
  const requestPhone = request['phone'] as string | null;
  const requestIsUnitOwner = request['isUnitOwner'] as boolean;

  // Adopt an existing `users` row if this person already has one.
  //
  // `users` has no `community_id`, so this lookup is platform-wide (see the
  // docblock on getUserForInvitation). A hit is the normal shape for someone
  // pre-provisioned by ANOTHER community who has not accepted yet. Letting
  // Supabase mint a fresh id in that case violates `public.users.id ===
  // auth.users.id` and, worse, the `users` insert below would then fail on the
  // UNIQUE email — after the auth account already exists.
  const existingUserRows = await scoped.selectFrom<Record<string, unknown>>(
    users,
    { id: users.id },
    eq(users.email, requestEmail),
  );
  const existingUserId = existingUserRows[0]?.['id'] as string | undefined;

  // Someone who already has an account (they proved this email with the
  // one-time code before this request reached a manager) joins with it.
  // Creating a second auth account fails "already registered", which left
  // every such approval a 500 and the request pending forever (audit F5).
  const joinsWithExistingAccount =
    existingUserId !== undefined && (await findAuthAccount(existingUserId)) === 'exists';

  let userId: string;
  if (joinsWithExistingAccount) {
    userId = existingUserId;
  } else {
    const authResult = await createAuthUserBoundTo({
      email: requestEmail,
      fullName: requestFullName,
      ...(existingUserId ? { userId: existingUserId } : {}),
    });

    if (!authResult.ok) {
      // Do NOT update request status so admin can retry
      throw new Error(`Failed to create auth user: ${authResult.error}`);
    }
    userId = authResult.userId;
  }

  // Everything below writes rows that the auth account depends on. If any of it
  // fails, the account is already loginable (`email_confirm: true`) and holds
  // the email address, so a retry would fail "already registered" forever —
  // the account has to go back.
  try {
    // Only INSERT when the row is genuinely new. When adopting an existing row
    // we deliberately leave `fullName` / `phone` alone: that row is shared with
    // every other community this person belongs to (`users` has no
    // `community_id`), so writing this request's self-reported values there
    // would overwrite another association's data — and blank out a stored phone
    // whenever the request form did not collect one. Nothing here requires the
    // profile to be fresh; the invariant this code owns is
    // `public.users.id === auth.users.id`.
    if (!existingUserId) {
      await scoped.insert(users, {
        id: userId,
        email: requestEmail,
        fullName: requestFullName,
        phone: requestPhone,
      });
    }

    // Insert user_roles row
    await scoped.insert(userRoles, {
      userId,
      role: 'resident',
      unitId: unitId ?? null,
      isUnitOwner: requestIsUnitOwner,
      displayTitle: requestIsUnitOwner ? 'Owner' : 'Tenant',
    });

    // Create notification preferences — unless a row survives from an earlier
    // membership here (removal leaves it), which would fail the unique key.
    const existingPrefs = await scoped.selectFrom<Record<string, unknown>>(
      notificationPreferences,
      { id: notificationPreferences.id },
      eq(notificationPreferences.userId, userId),
    );
    if (existingPrefs.length === 0) {
      await scoped.insert(notificationPreferences, {
        userId,
      });
    }
  } catch (err) {
    if (joinsWithExistingAccount) {
      // NEVER roll back here: the auth account is the person's real one,
      // used in other communities. Nothing was created for it to undo.
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to attach approved access request ${requestId}: ${reason}`);
    }
    const rollback = await rollBackAuthUser(userId);
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to provision approved access request ${requestId}: ${reason} (${rollback})`,
    );
  }

  // Update access request status
  await scoped.update(
    accessRequests,
    {
      status: 'approved',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      unitId: unitId ?? null,
    },
    eq(accessRequests.id, requestId),
  );

  // Send welcome email
  const communityRows = await scoped.query(communities);
  const community = communityRows[0];
  const communityName = (community?.['name'] as string) ?? 'PropertyPro';
  const loginUrl = `${getBaseUrl()}/auth/login`;

  sendEmail({
    to: requestEmail,
    subject: `Welcome to ${communityName} on PropertyPro`,
    category: 'transactional',
    react: createElement(AccessRequestApprovedEmail, {
      branding: { communityName },
      recipientName: requestFullName,
      loginUrl,
    }),
  }).catch((err: unknown) => console.error('[access-request] Welcome email failed:', err));

  // Audit log
  await logAuditEvent({
    userId: reviewerId,
    action: 'access_request.approved',
    resourceType: 'access_request',
    resourceId: String(requestId),
    communityId,
    newValues: {
      email: requestEmail,
      fullName: requestFullName,
      createdUserId: userId,
    },
  });

  return { userId };
}

// ---------------------------------------------------------------------------
// denyAccessRequest
// ---------------------------------------------------------------------------

export async function denyAccessRequest(params: {
  requestId: number;
  communityId: number;
  reviewerId: string;
  reason?: string;
}): Promise<void> {
  const { requestId, communityId, reviewerId, reason } = params;
  const scoped = createScopedClient(communityId);

  // Primary-key lookup, tenant- and soft-delete-scoped.
  const request = await scoped.queryById(accessRequests, requestId);

  if (!request) {
    throw new NotFoundError('Access request not found');
  }

  if (request['status'] !== 'pending') {
    throw new ValidationError('Only pending requests can be denied.');
  }

  // Update status
  await scoped.update(
    accessRequests,
    {
      status: 'denied',
      denialReason: reason ?? null,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    },
    eq(accessRequests.id, requestId),
  );

  // Send denial notification
  const communityRows = await scoped.query(communities);
  const community = communityRows[0];
  const communityName = (community?.['name'] as string) ?? 'PropertyPro';

  sendEmail({
    to: request['email'] as string,
    subject: `Update on your access request for ${communityName}`,
    category: 'transactional',
    react: createElement(AccessRequestDeniedEmail, {
      branding: { communityName },
      recipientName: request['fullName'] as string,
      reason,
    }),
  }).catch((err: unknown) => console.error('[access-request] Denial email failed:', err));

  // Audit log
  await logAuditEvent({
    userId: reviewerId,
    action: 'access_request.denied',
    resourceType: 'access_request',
    resourceId: String(requestId),
    communityId,
    newValues: {
      email: request['email'] as string,
      reason: reason ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// paginatePendingAccessRequests
// ---------------------------------------------------------------------------

/**
 * Paginated list of pending access requests for the GET admin route. Uses the
 * canonical `paginate()` helper with the `status='pending'` filter pushed into
 * the SQL `where` predicate (Plan A2 / B3 #223 — keeps the route's existing
 * cursor + canonical envelope semantics).
 *
 * Caller MUST authorize via `requirePermission(membership, 'residents', 'write')`
 * before invoking.
 */
export async function paginatePendingAccessRequests(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
}) {
  const scoped = createScopedClient(params.communityId);
  return await paginate(
    scoped,
    accessRequests,
    { cursor: params.cursor, pageSize: params.pageSize },
    { where: eq(accessRequests.status, 'pending') },
  );
}
