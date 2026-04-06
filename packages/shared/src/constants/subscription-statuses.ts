/**
 * Subscription status enum shared across server, client, and billing logic.
 *
 * These match the string values written to `communities.subscription_status`
 * by the Stripe webhook handler.
 */
export const ALL_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'expired',
  'unpaid',
  'incomplete_expired',
] as const;

export type SubscriptionStatus = (typeof ALL_STATUSES)[number];

/** Statuses that count toward billable MRR (customer is paying). */
export const BILLABLE_STATUSES = ['active', 'past_due'] as const;

/** Statuses that indicate a trial — count toward potential MRR only. */
export const TRIAL_STATUSES = ['trialing'] as const;

/** Statuses that indicate churn (subscription ended). */
export const CHURNED_STATUSES = [
  'canceled',
  'expired',
  'unpaid',
  'incomplete_expired',
] as const;

export function isBillableStatus(s: string): boolean {
  return (BILLABLE_STATUSES as readonly string[]).includes(s);
}

export function isTrialStatus(s: string): boolean {
  return (TRIAL_STATUSES as readonly string[]).includes(s);
}

export function isChurnedStatus(s: string): boolean {
  return (CHURNED_STATUSES as readonly string[]).includes(s);
}

export function isKnownStatus(s: string): s is SubscriptionStatus {
  return (ALL_STATUSES as readonly string[]).includes(s);
}
