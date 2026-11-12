/**
 * Who may add a community (Communities redesign, decided 2026-11-11).
 *
 * Adding a community bills it to a portfolio, so it belongs to the person who
 * pays for that portfolio, and only while they also hold root, the billing
 * authority, in one of its communities:
 *
 *   - Owns a billing group: allowed when they are root manager of a community
 *     in that group.
 *   - Owns none: allowed when they manage exactly one community, are its root,
 *     and it already has a Stripe customer and no billing group. Their first
 *     add sets the group up around that community.
 *
 * The account menu, the Communities page and `POST /api/v1/pm/communities` all
 * ask this one function. Pure, so it is tested without a database; the facts
 * come from `findAddCommunityFactsUnscoped`.
 */
/** Matches `AddCommunityFacts` from `@propertypro/db/unsafe`. */
export interface AddCommunityFacts {
  ownedBillingGroupIds: number[];
  managedRoles: Array<{
    communityId: number;
    role: string;
    billingGroupId: number | null;
    hasStripeCustomer: boolean;
  }>;
}

export type AddCommunityRefusal =
  | 'not_root'
  | 'not_billing_owner'
  | 'several_billing_groups'
  | 'no_stripe_customer';

export type AddCommunityAccess =
  | { allowed: true; billingGroupId: number | null }
  | { allowed: false; reason: AddCommunityRefusal };

export function decideAddCommunityAccess(facts: AddCommunityFacts): AddCommunityAccess {
  const { ownedBillingGroupIds, managedRoles } = facts;

  if (ownedBillingGroupIds.length > 1) {
    return { allowed: false, reason: 'several_billing_groups' };
  }

  const ownedGroupId = ownedBillingGroupIds[0];
  if (ownedGroupId !== undefined) {
    const rootInGroup = managedRoles.some(
      (r) => r.role === 'root_manager' && r.billingGroupId === ownedGroupId,
    );
    return rootInGroup
      ? { allowed: true, billingGroupId: ownedGroupId }
      : { allowed: false, reason: 'not_root' };
  }

  // No billing group yet: only the root of the one community they manage can
  // start one, and only around that community.
  const communityIds = new Set(managedRoles.map((r) => r.communityId));
  if (communityIds.size !== 1) {
    return { allowed: false, reason: 'not_billing_owner' };
  }
  const root = managedRoles.find((r) => r.role === 'root_manager');
  if (!root) return { allowed: false, reason: 'not_root' };
  // Already billed under someone else's portfolio.
  if (root.billingGroupId !== null) return { allowed: false, reason: 'not_billing_owner' };
  if (!root.hasStripeCustomer) return { allowed: false, reason: 'no_stripe_customer' };
  return { allowed: true, billingGroupId: null };
}

export const ADD_COMMUNITY_REFUSAL_MESSAGES: Record<AddCommunityRefusal, string> = {
  not_root:
    'Only the root manager who pays for this portfolio can add a community.',
  not_billing_owner:
    'Only the person who pays for this portfolio can add a community. Ask them to add it.',
  several_billing_groups:
    'Your account pays for more than one portfolio, so we can’t tell which one to add to. Contact support.',
  no_stripe_customer:
    'Set up billing for your community before adding another one.',
};
