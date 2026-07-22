/**
 * Subscription guard — P2-34a
 *
 * Enforces subscription status for admin mutation routes.
 * Called explicitly in write route handlers — NOT applied as global middleware —
 * to allow fine-grained control (webhooks, public reads are exempt).
 *
 * Degradation rules:
 *   active / trialing / null → allowed (null = new community, not yet provisioned)
 *   past_due               → allowed (banner shown at UI level only)
 *   free_access_expires_at > now → allowed (overrides locked status, see spec §4.2)
 *   canceled (after seven-day grace) / expired / unpaid → throws 403 SUBSCRIPTION_REQUIRED
 *
 * A3 carve-out: `allowResidentSelfService` short-circuits the guard for
 * resident-initiated dues/rent payments. Those flow through the community's
 * Stripe Connect account, not the community's PropertyPro subscription, so a
 * platform-billing soft-lock must not block a resident from paying what they owe.
 */
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
// AUTHZ: Reads communities row by primary key — communities is the root tenant table and cannot be scoped by community_id (it IS the community_id).
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { resolveLifecycleState, isEntitledState } from '@propertypro/shared';
import { AppError } from '@/lib/api/errors/AppError';

/**
 * Verify that the community's subscription allows admin mutations.
 * Throws AppError(403, 'SUBSCRIPTION_REQUIRED') if locked.
 */
export interface SubscriptionGuardOptions {
  /**
   * When true, bypass the platform-subscription lock for a resident paying their
   * own dues/rent (dues run through Stripe Connect, not the PropertyPro sub).
   */
  allowResidentSelfService?: boolean;
}

export async function requireActiveSubscriptionForMutation(
  communityId: number,
  options: SubscriptionGuardOptions = {},
): Promise<void> {
  if (options.allowResidentSelfService) {
    return;
  }

  const db = createUnscopedClient();
  const rows = await db
    .select({
      subscriptionStatus: communities.subscriptionStatus,
      freeAccessExpiresAt: communities.freeAccessExpiresAt,
      subscriptionCanceledAt: communities.subscriptionCanceledAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const status = rows[0]?.subscriptionStatus ?? null;

  // One derived state rather than three open-coded checks. It encodes the same
  // rules this function used to spell out inline — free access wins, `canceled`
  // inside the paid window is still entitled, null/unknown statuses fail open —
  // and is now shared with the billing banners so the UI and the guard cannot
  // disagree about whether a community is locked.
  const state = resolveLifecycleState({
    subscriptionStatus: status,
    subscriptionCanceledAt: rows[0]?.subscriptionCanceledAt ?? null,
    freeAccessExpiresAt: rows[0]?.freeAccessExpiresAt ?? null,
  });

  if (!isEntitledState(state)) {
    throw new AppError(
      'Your subscription is no longer active. Please reactivate to continue.',
      403,
      'SUBSCRIPTION_REQUIRED',
      { subscriptionStatus: status },
    );
  }
}
