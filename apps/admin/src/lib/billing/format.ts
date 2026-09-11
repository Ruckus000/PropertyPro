/**
 * The one place the billing UI turns CENTS into money on a screen.
 *
 * ## Why this is a module and not three inline `Intl.NumberFormat` calls
 *
 * `BillingOverview` is denominated in CENTS throughout — `mrrCents`,
 * `pastDueCents`, `BillingRow.mrrCents`, `CommunityBillingInvoice.amountCents`
 * and, unusually, `series` as well, so that every money value on that interface
 * shares one unit. `lib/server/dashboard-series.ts` exposes the SAME
 * `revenue_snapshots.mrr_cents` column already converted to DOLLARS, and the
 * dashboard's own `formatCurrency` helpers (`KpiGrid`, `RevenueCard`) therefore
 * take dollars. The two are one function call apart and a hundred times
 * different, and the wrong one renders a plausible number rather than an
 * obviously broken one — $4,200 of MRR shown as $420,000.
 *
 * So the division lives here, once, named for its input unit. A caller that
 * already holds dollars must use `formatDollarsAsCurrency` and be visibly
 * doing so.
 *
 * @module lib/billing/format
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Money already in dollars. */
export function formatDollarsAsCurrency(dollars: number): string {
  return USD.format(Number.isFinite(dollars) ? dollars : 0);
}

/** Money in cents — the unit every field on `BillingOverview` uses. */
export function formatCentsAsCurrency(cents: number): string {
  return formatDollarsAsCurrency(centsToDollars(cents));
}

/**
 * Cents → dollars.
 *
 * Exported separately because the MRR sparkline needs the NUMBER, not the
 * formatted string: `MiniBars` renders its hover title from the raw value, so a
 * series handed over in cents would draw correct bars over wrong labels.
 */
export function centsToDollars(cents: number): number {
  return Number.isFinite(cents) ? cents / 100 : 0;
}
