/**
 * Read-entitlement guard — lapsed-state admin read gating.
 *
 * The write twin `requireActiveSubscriptionForMutation` blocks mutations for a
 * churned community. This blocks *admin reads* for a community that is `lapsed`
 * (canceled AND past the 7-day paid grace) — and ONLY for admin-tier callers.
 *
 * Residents are never gated: a resident must not lose read access because the
 * association stopped paying. The `membership.isAdmin` short-circuit returns
 * before any DB work, so a resident read costs nothing here.
 *
 * `lapsed` is the single non-entitled `LifecycleState`; every other state
 * (unprovisioned/comped/trialing/active/past_due/grace) passes. Unrecognized
 * Stripe statuses resolve to `active` inside `resolveLifecycleState`, preserving
 * the long-standing fail-open on a Stripe vocabulary change.
 */
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
// AUTHZ: Reads communities row by primary key — communities is the root tenant table and cannot be scoped by community_id (it IS the community_id).
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { resolveLifecycleState, isEntitledState } from '@propertypro/shared';
import { AppError } from '@/lib/api/errors/AppError';

/** The subset of CommunityMembership this guard needs. */
export interface ReadEntitlementActor {
  isAdmin: boolean;
}

export async function requireEntitledForAdminRead(
  communityId: number,
  membership: ReadEntitlementActor,
): Promise<void> {
  // Residents keep full read access even on a lapsed community. Short-circuit
  // BEFORE the DB lookup so their reads pay nothing for this guard.
  if (!membership.isAdmin) return;

  const db = createUnscopedClient();
  const rows = await db
    .select({
      subscriptionStatus: communities.subscriptionStatus,
      subscriptionCanceledAt: communities.subscriptionCanceledAt,
      freeAccessExpiresAt: communities.freeAccessExpiresAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const status = rows[0]?.subscriptionStatus ?? null;
  const state = resolveLifecycleState({
    subscriptionStatus: status,
    subscriptionCanceledAt: rows[0]?.subscriptionCanceledAt ?? null,
    freeAccessExpiresAt: rows[0]?.freeAccessExpiresAt ?? null,
  });

  if (!isEntitledState(state)) {
    throw new AppError(
      'This community’s subscription has lapsed. Reactivate to restore access.',
      403,
      'SUBSCRIPTION_REQUIRED',
      { subscriptionStatus: status },
    );
  }
}
