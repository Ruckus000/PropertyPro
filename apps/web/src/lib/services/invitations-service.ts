/**
 * Invitations Service
 *
 * Tenant-scoped lookups + writes for the `invitations` table and the
 * supporting `users` / `user_roles` / `communities` reads needed by the
 * /api/v1/invitations route (POST create + PATCH accept-via-token).
 *
 * Includes the auth-admin user-creation wrap for invitation acceptance.
 *
 * NOTE: pre-A3-drain-#60 the route used `scoped.query(table)` + JS `.find()`
 * for FIVE separate lookups (community, user, user-role, invitation-by-token,
 * user-by-id-during-accept). Each loaded the entire community's rows just to
 * read one. Helpers here use targeted `selectFrom(..., eq(pk, value))` lookups
 * instead — fix is the same class as drain #244 / #287 / #292 / #295.
 */
import {
  communities,
  createScopedClient,
  invitations as invitationsTable,
  userRoles,
  users,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createAuthUserBoundTo } from '@/lib/services/auth-user-binding';

export interface InvitationCommunityName {
  name: string;
}

/**
 * One-row community lookup for the invitation-email branding.
 * Returns `null` when no row matches.
 */
export async function getCommunityNameForInvitation(
  communityId: number,
): Promise<InvitationCommunityName | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    communities,
    { name: communities.name },
    eq(communities.id, communityId),
  )) as unknown as Array<{ name: unknown }>;
  const row = rows[0];
  if (!row || typeof row.name !== 'string') return null;
  return { name: row.name };
}

export interface InvitedUser {
  email: string;
  fullName: string | null;
}

/**
 * One-row user lookup for the invitation flow (email + display name).
 * Returns `null` when no row matches OR email is missing/wrong-typed.
 *
 * ⚠️ `users` is a global table and the scoped client does **NOT** isolate it.
 * There is no `community_id` column, so `hasTenantIsolation`
 * (packages/db/src/scoped-client.ts) returns false and the only predicate
 * applied is `deleted_at IS NULL`. This lookup will therefore resolve ANY user
 * on the platform, member of `communityId` or not.
 *
 * The previous version of this comment claimed the scoped client "applies the
 * community-membership join under the hood for tenant isolation". No such join
 * exists. Callers must not treat a successful lookup here as proof of
 * membership — check it explicitly.
 */
export async function getUserForInvitation(
  communityId: number,
  userId: string,
): Promise<InvitedUser | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    users,
    { email: users.email, fullName: users.fullName },
    eq(users.id, userId),
  )) as unknown as Array<{ email?: unknown; fullName?: unknown }>;
  const row = rows[0];
  if (!row || typeof row.email !== 'string') return null;
  return {
    email: row.email,
    fullName: typeof row.fullName === 'string' ? row.fullName : null,
  };
}

/**
 * One-row user-role lookup. Returns the v3 role string (e.g. 'resident',
 * 'property_manager', 'root_manager') or `null` when no row matches.
 */
export async function getUserRoleForInvitation(
  communityId: number,
  userId: string,
): Promise<string | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    userRoles,
    { role: userRoles.role },
    eq(userRoles.userId, userId),
  )) as unknown as Array<{ role?: unknown }>;
  const row = rows[0];
  return row && typeof row.role === 'string' ? row.role : null;
}

/**
 * Insert an invitation row.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership.
 */
export async function createInvitation(params: {
  communityId: number;
  userId: string;
  invitedBy: string;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  const scoped = createScopedClient(params.communityId);
  await scoped.insert(invitationsTable, {
    userId: params.userId,
    token: params.token,
    invitedBy: params.invitedBy,
    expiresAt: params.expiresAt,
  });
}

export interface ActiveInvitation {
  userId: string;
  expiresAt: Date | string;
  consumedAt: Date | string | null;
}

/**
 * Find the invitation row matching `token`. Returns `null` when no row
 * matches. Caller is responsible for consumed-at and expiry checks
 * (returned verbatim from the row so the route can produce
 * TOKEN_USED / TOKEN_EXPIRED responses with the right shape).
 */
export async function findInvitationByToken(
  communityId: number,
  token: string,
): Promise<ActiveInvitation | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    invitationsTable,
    {
      userId: invitationsTable.userId,
      expiresAt: invitationsTable.expiresAt,
      consumedAt: invitationsTable.consumedAt,
    },
    eq(invitationsTable.token, token),
  )) as unknown as Array<ActiveInvitation>;
  return rows[0] ?? null;
}

/**
 * Mark the invitation row as consumed (sets `consumedAt`). Caller MUST
 * have already verified the row exists and is unconsumed/unexpired.
 */
export async function markInvitationConsumed(
  communityId: number,
  token: string,
  consumedAt: Date,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(
    invitationsTable,
    { consumedAt },
    eq(invitationsTable.token, token),
  );
}

/**
 * Create the Supabase auth user that backs an accepted invitation.
 * Returns a discriminated union so the caller can produce structured
 * error responses without re-throwing.
 *
 * AUTHZ: token-authenticated — caller MUST have validated the
 * invitation token via `findInvitationByToken` + consumed/expiry
 * checks BEFORE calling.
 */
export async function createSupabaseAuthUserFromInvitation(params: {
  email: string;
  password: string;
  fullName: string | null;
  externalUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // The invitee's `users` row — and the `user_roles` row carrying their unit and
  // owner/tenant binding — was created when the admin invited them, days
  // earlier, with this id. So the id is ALWAYS known here and must always be
  // adopted; see auth-user-binding.ts for why that matters and what happens on
  // a mismatch.
  const result = await createAuthUserBoundTo({
    email: params.email,
    password: params.password,
    fullName: params.fullName,
    userId: params.externalUserId,
    metadata: { external_user_id: params.externalUserId },
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
