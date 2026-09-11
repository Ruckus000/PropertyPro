/**
 * How a `BillingRow.status` is labelled and tinted on screen — once.
 *
 * `BillingTab` and `BillingList` each held a byte-identical copy of both maps,
 * typed differently (`Record<string, …>` against
 * `Record<BillingRow['status'], …>`). Two screens rendering the same five
 * statuses must not be able to disagree about what "past_due" is called or
 * which colour it is: the portfolio row an operator clicks and the workspace tab
 * they land on are the same subscription, and a status that changes name between
 * them reads as a data problem.
 *
 * Keyed on `BillingRow['status']` rather than `string`, so adding a status to
 * that union fails the build here instead of rendering the raw enum value.
 *
 * @module lib/billing/status-display
 */
import type { BadgeVariant } from '@propertypro/ui';
import type { BillingRow } from '@/lib/server/billing';

export const BILLING_STATUS_LABELS: Record<BillingRow['status'], string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past due',
  canceled: 'Canceled',
  other: 'Other',
};

export const BILLING_STATUS_VARIANTS: Record<BillingRow['status'], BadgeVariant> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  canceled: 'neutral',
  other: 'neutral',
};
