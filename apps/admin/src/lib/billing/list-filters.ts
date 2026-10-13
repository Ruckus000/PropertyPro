/**
 * The status tabs on `/billing`, and therefore the closed set of values its
 * `?status=` param may carry.
 *
 * One list for both ends of the link. `BillingList` renders these tabs and
 * validates `?status=` against them; the dashboard's `SubscriptionsCard` links
 * into `/billing?status=…` and must only ever name one of them. Its rows used to
 * link every status unconditionally, while the page read no `?status=` at all —
 * so "Past due 3" on the dashboard opened the whole portfolio, and `active` /
 * `none`, which have no tab, could never have worked either way.
 *
 * A plain module, not an export of the `'use client'` `BillingList`, because
 * `SubscriptionsCard` is a server component and needs the values themselves.
 *
 * @module lib/billing/list-filters
 */
import type { BillingRow } from '@/lib/server/billing';

export type BillingListFilter = 'all' | Extract<BillingRow['status'], 'past_due' | 'trialing' | 'canceled'>;

export const BILLING_LIST_FILTERS: readonly { value: BillingListFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'past_due', label: 'Past due' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'canceled', label: 'Canceled' },
];

/** `?status=` is untrusted input — a bookmark, a shared link, a hand-edited URL. */
export function isBillingListFilter(value: string | null | undefined): value is BillingListFilter {
  return BILLING_LIST_FILTERS.some((filter) => filter.value === value);
}
