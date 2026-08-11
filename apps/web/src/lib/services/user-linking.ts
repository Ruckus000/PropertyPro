// AUTHZ: decides whether an actor may attach an ALREADY-EXISTING platform user
// to a community. It compares the actor's community memberships against the
// target's, which is cross-community by nature — no per-request community scope
// can express "do these two people share any community?" — so it imports
// findUserCommunitiesUnscoped from @propertypro/db/unsafe and MUST stay in
// WEB_UNSAFE_IMPORT_ALLOWLIST in scripts/verify-scoped-db-access.ts (both guards
// apply — the AUTHZ comment alone is insufficient). It reads memberships only;
// it never writes, and it never returns the target's profile to the caller.
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import { ForbiddenError } from '@/lib/api/errors';
import { checkPermissionV2 } from '@/lib/db/access-control';
// AUTHZ: cross-community unscoped read of both users' memberships, to answer whether the actor can already see the target (see the file-level rationale above); reads only, never writes, and never returns the target's profile.
import { findUserCommunitiesUnscoped } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';

/** The subset of a membership row this guard reads. */
export interface LinkingMembership {
  communityId: number;
  communityType: CommunityType;
  role: CommunityRole;
  isUnitOwner: boolean;
}

const REFUSAL =
  'That email belongs to an existing account you cannot already see. '
  + 'Someone who shares a community with them can add them, or they can request access themselves.';

/**
 * Load the actor's memberships once, for callers that guard many rows.
 *
 * The bulk CSV import runs this guard per row; without hoisting, a 500-row file
 * would issue 500 identical lookups of the actor's own memberships.
 */
export async function loadActorCommunitiesForLinking(
  actorUserId: string,
): Promise<LinkingMembership[]> {
  const rows = (await findUserCommunitiesUnscoped(actorUserId)) as unknown as LinkingMembership[];
  // Project down to the four fields this guard reads. `findUserCommunitiesUnscoped`
  // also returns community name, slug, subscriptionPlan, trialEndsAt and more, and
  // exporting it whole would launder an unscoped read behind a path
  // verify-scoped-db-access.ts does not police (it allowlists importers of
  // @propertypro/db/unsafe, not of this module). Narrowing here means the extra
  // fields never leave the file even if a future caller misuses the helper.
  return rows.map((row) => ({
    communityId: row.communityId,
    communityType: row.communityType,
    role: row.role,
    isUnitOwner: row.isUnitOwner,
  }));
}

/**
 * Does this `users` row correspond to a real, activated account?
 *
 * Since the invite-accept fix, an invitee's auth user adopts the pre-provisioned
 * `users.id`, so a matching `auth.users` row is the signal that a human has
 * actually claimed this identity.
 */
async function hasActivatedAuthAccount(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    if (error) {
      // Fail CLOSED: an unreadable auth state must not be read as "unclaimed
      // stub, go ahead and take it".
      return true;
    }
    return Boolean(data?.user);
  } catch {
    return true;
  }
}

/**
 * Guard the "add a resident by email" paths against cross-tenant harvesting.
 *
 * ## The hole this closes
 *
 * `users` has no `community_id`, so `createScopedClient` does NOT isolate it —
 * `hasTenantIsolation` (packages/db/src/scoped-client.ts) returns false and the
 * only predicate applied is `deleted_at IS NULL`. The add-resident paths look an
 * invitee up **by email across the whole platform** and reuse the row they find.
 *
 * Left unguarded, a manager of community X could type the email address of a
 * resident of community Y and bind that person's user id into X. Once the
 * `user_roles` row exists, `listResidentsForCommunity` hydrates it from the
 * global `users` table and hands back the victim's **real stored name, email and
 * phone**. Guess an address, receive that person's contact details. Issue #940.
 *
 * ## The rule
 *
 * You may attach an existing user only if you can **already read them**: the
 * actor must hold `residents:read` in some community the target belongs to.
 * Then nothing crosses a boundary it was not already across.
 *
 * Bare shared membership is deliberately NOT enough. In `apartment` communities
 * a `tenant` has `residents: { read: false }` (packages/shared/src/rbac-matrix.ts),
 * so a tenant who happens to manage another community could otherwise pull a
 * neighbour they cannot see in their own building.
 *
 * This preserves the case the global lookup exists to serve — one person owning
 * units in two associations, added by a property manager who runs both.
 *
 * ## What it does NOT fix
 *
 * The callers' responses still distinguish "new user" from "existing user", so
 * an address can be probed for existence, and any actionable refusal does the
 * same. Enumeration is a smaller problem than disclosure and is inherent to an
 * add-by-email UX; closing it means changing that UX, not adding a predicate.
 *
 * It also does not help a resident who was pre-provisioned by community A and is
 * being added to community B by a manager who does not run A. That person is
 * refused, and must accept A's invitation (or request access to B) first. An
 * earlier draft of this comment claimed otherwise; it was wrong.
 *
 * That last point has a sharper edge worth naming: **one membership anywhere
 * burns the address everywhere else.** An attacker who adds `victim@x.com` to
 * their own community creates a `users` row, after which every unrelated
 * community is refused here — and the self-service fallback is currently broken
 * too (see issue #944). Availability is traded for confidentiality deliberately,
 * but the durable fix is an approve-the-link request flow, not this predicate.
 *
 * Finally, claiming a never-activated orphan does disclose the name and phone
 * that the FIRST community's admin typed for that address. That is the accepted
 * price of not handing every manager a way to permanently burn an email.
 *
 * @throws ForbiddenError when the actor cannot already read the target.
 */
export async function assertActorMayAttachExistingUser(params: {
  actorUserId: string;
  targetUserId: string;
  communityId: number;
  /** Pre-loaded actor memberships, for per-row callers. */
  actorCommunities?: LinkingMembership[];
}): Promise<void> {
  const { actorUserId, targetUserId, communityId, actorCommunities } = params;

  // Attaching yourself is always fine and needs no cross-community read.
  if (actorUserId === targetUserId) {
    return;
  }

  const targetCommunities = (await findUserCommunitiesUnscoped(
    targetUserId,
  )) as unknown as LinkingMembership[];

  // Already a member here: nothing new is disclosed by adding a role, and the
  // callers reject the duplicate separately with a clearer message.
  if (targetCommunities.some((row) => row.communityId === communityId)) {
    return;
  }

  if (targetCommunities.length === 0) {
    // An orphaned `users` row — no community claims this person.
    //
    // `users.email` is UNIQUE and removing a resident hard-deletes only the role
    // row, so "add resident → remove resident" leaves exactly this shape. If the
    // guard refused it outright, that email address would be permanently
    // unusable in EVERY community, which hands any manager a way to burn
    // arbitrary addresses. So a never-activated stub stays claimable; a row
    // belonging to someone who has actually signed in does not.
    if (!(await hasActivatedAuthAccount(targetUserId))) {
      return;
    }
    throw new ForbiddenError(REFUSAL);
  }

  const actorRows = actorCommunities ?? (await loadActorCommunitiesForLinking(actorUserId));
  const actorById = new Map(actorRows.map((row) => [row.communityId, row]));

  const canAlreadyRead = targetCommunities.some((targetRow) => {
    const actorRow = actorById.get(targetRow.communityId);
    if (!actorRow) return false;
    try {
      return checkPermissionV2(actorRow.role, actorRow.communityType, 'residents', 'read', {
        isUnitOwner: actorRow.isUnitOwner,
      });
    } catch {
      // An unrecognised role/community-type combination indexes into nothing in
      // RBAC_MATRIX and throws. Treat "we cannot determine that you may read
      // them" as "you may not" — a 403 is the right answer here, and a raw
      // TypeError would surface as a 500.
      return false;
    }
  });

  if (!canAlreadyRead) {
    throw new ForbiddenError(REFUSAL);
  }
}
