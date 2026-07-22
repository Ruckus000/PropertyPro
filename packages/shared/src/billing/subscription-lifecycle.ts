/**
 * Which billing action a community is eligible for, based on the state of its
 * Stripe subscription.
 *
 * ONE definition, shared by the API routes and the page that picks which UI to
 * render. These predicates were previously open-coded as
 * `subscriptionStatus === 'active'` in three places, which is a bug factory:
 * `communities.subscription_status` stores Stripe's RAW status string, and
 * `trialing`, `past_due`, `incomplete` and `unpaid` all describe a LIVE
 * subscription object that fails that equality. Since every self-serve signup
 * spends its first `SIGNUP_TRIAL_DAYS` in `trialing`, that gap routed brand-new
 * customers into the "buy a subscription" flow while they already had one —
 * minting a second subscription against the same Stripe customer.
 */
import { isChurnedStatus } from '../constants/subscription-statuses';
import { isWithinPaidGrace } from './paid-grace';

export interface SubscriptionLifecycleState {
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
}

/**
 * The one named state every guard, banner and gate should key on.
 *
 * Purely DERIVED from columns that already exist — no new column, no migration.
 * Churn state was previously inferred independently at each call site from some
 * mix of `subscription_status`, a nulled `subscription_plan`,
 * `subscription_canceled_at` and `free_access_expires_at`, and those call sites
 * disagreed with each other. Deriving it once removes the drift.
 *
 *   unprovisioned — never subscribed. The majority of rows today.
 *   comped        — an active free-access grant. Overrides everything below.
 *   trialing      — inside the signup trial.
 *   active        — paying.
 *   past_due      — payment failed, Stripe still retrying.
 *   grace         — canceled, still inside the paid grace window.
 *   lapsed        — canceled, grace expired.
 */
export type LifecycleState =
  | 'unprovisioned'
  | 'comped'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'grace'
  | 'lapsed';

export interface LifecycleInput {
  subscriptionStatus: string | null;
  subscriptionCanceledAt: Date | null;
  freeAccessExpiresAt?: Date | null;
}

export function resolveLifecycleState(
  input: LifecycleInput,
  now: Date = new Date(),
): LifecycleState {
  // Free access overrides a locked subscription — matches subscription-guard's
  // long-standing rule (spec §4.2), kept first so a comped community is never
  // treated as churned.
  if (input.freeAccessExpiresAt && input.freeAccessExpiresAt > now) return 'comped';

  const status = input.subscriptionStatus;
  if (status === null) return 'unprovisioned';
  if (status === 'trialing') return 'trialing';
  if (status === 'past_due') return 'past_due';

  if (isChurnedStatus(status)) {
    // Only `canceled` earns a grace window, and only with a real timestamp.
    // `expired`/`unpaid`/`incomplete_expired` are hard stops.
    if (
      status === 'canceled' &&
      input.subscriptionCanceledAt &&
      isWithinPaidGrace(input.subscriptionCanceledAt, now)
    ) {
      return 'grace';
    }
    return 'lapsed';
  }

  // `active`, plus anything Stripe adds that isn't a known churn state
  // (`incomplete`, `paused`, …). Deliberately permissive: these guards have
  // always failed OPEN on unrecognized statuses, and tightening that here would
  // silently lock out communities on a Stripe vocabulary change.
  return 'active';
}

/** States where the community is entitled to its paid surfaces. */
const ENTITLED_STATES: readonly LifecycleState[] = [
  'unprovisioned',
  'comped',
  'trialing',
  'active',
  'past_due',
  'grace',
];

/**
 * Whether this state still grants full paid access.
 *
 * `lapsed` is the only state that does not — and today it behaves exactly like
 * the others for reads, because read gating for churned communities has never
 * existed. Introducing that is a separate, deliberate change.
 */
export function isEntitledState(state: LifecycleState): boolean {
  return ENTITLED_STATES.includes(state);
}

/** Statuses where Stripe still holds a mutable subscription we can upgrade in place. */
const CHANGEABLE_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];

/**
 * May this community start a NEW subscription via Stripe Checkout?
 *
 * True only when there is no live subscription to collide with: either no
 * subscription has ever been created, or the last one is definitively dead.
 *
 * Deliberately an ALLOW-list of dead states rather than a block-list of live
 * ones. Stripe adds statuses over time (`paused`, `incomplete`, …); an
 * unrecognized status must fall through to "cannot start a new one", because
 * the cost of wrongly blocking is a support ticket while the cost of wrongly
 * allowing is charging a customer twice.
 *
 * A subscription id with no status is likewise treated as live — that pairing
 * means we know a subscription exists but haven't synced its state yet.
 */
export function canStartNewSubscription(state: SubscriptionLifecycleState): boolean {
  if (!state.stripeSubscriptionId) return true;
  if (state.subscriptionStatus === null) return false;
  return isChurnedStatus(state.subscriptionStatus);
}

/**
 * May this community switch tier/interval on its EXISTING subscription?
 *
 * Includes `trialing` and `past_due`, not just `active`: Stripe accepts
 * `subscriptions.update` in both, and excluding them left trialing customers
 * with no upgrade path at all — the change-plan route rejected them and the
 * checkout route would have sold them a duplicate.
 */
export function canChangeExistingPlan<T extends SubscriptionLifecycleState>(
  state: T,
): state is T & { stripeSubscriptionId: string } {
  if (!state.stripeSubscriptionId || state.subscriptionStatus === null) return false;
  return CHANGEABLE_STATUSES.includes(state.subscriptionStatus);
}
