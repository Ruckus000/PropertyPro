/**
 * Billing as a shell signal: the nav badge and the tray rows (spec D11).
 *
 * The badge counts PAST-DUE subscriptions — money we are not collecting, one row
 * per community an operator can act on. Trials ending, coupons and plan mix are
 * all on the `/billing` screen but none of them is a task, so counting them would
 * inflate a badge with work nobody can do. `critical` is always null: the health
 * provider sits first in `DEFAULT_PROVIDERS` and owns the one banner the console
 * can be interrupted by, and a billing problem does not outrank an outage.
 *
 * ## Why this one refuses to throw, unlike `healthSignals`
 *
 * An unset `STRIPE_SECRET_KEY` is the normal state of a fresh checkout. Letting
 * the read throw would put a Sentry event on every shell render of every
 * developer's laptop — the same reasoning that makes `health.ts` report `unknown`
 * rather than `down` for an unconfigured dependency. So a missing credential
 * short-circuits to an empty result BEFORE the Stripe client is constructed.
 *
 * A Stripe read that actually FAILS still throws: `getShellSignals` settles every
 * provider and reports the rejection, which is the right outcome for "we asked
 * and it broke".
 *
 * @module lib/server/signals/billing
 */
import { getBillingOverview, isStripeConfigured, type BillingRow } from '../billing';
import type { SignalProvider } from './types';

/** How many past-due rows reach the tray before it stops being a tray. */
const TRAY_ROW_LIMIT = 5;

const MS_PER_DAY = 86_400_000;

/**
 * Whole days since collection failed, floored, never negative.
 *
 * Elapsed milliseconds rather than a calendar diff — a `differenceInDays` across
 * a DST boundary is off by one, and "3 days past due" rendered for a 2-day-old
 * failure is a number an operator would act on.
 */
export function daysPastDue(pastDueSince: string | null, now: number): number {
  if (!pastDueSince) return 0;
  const since = Date.parse(pastDueSince);
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, Math.floor((now - since) / MS_PER_DAY));
}

/**
 * Where a past-due row points.
 *
 * An ORPHAN (`communityId === null`) has no workspace to open — `/clients/null`
 * would render the root `not-found`, which escapes the console shell entirely
 * (see the nav-config-ahead-of-its-routes trap). It goes to the portfolio, which
 * is where an unlinked subscription can actually be dealt with.
 */
export function pastDueHref(row: BillingRow): string {
  return row.communityId === null ? '/billing' : `/clients/${row.communityId}?tab=billing`;
}

export const billingSignals: SignalProvider = {
  key: 'billing',
  async load() {
    if (!isStripeConfigured()) return { count: 0, items: [], critical: null };

    const overview = await getBillingOverview();
    const now = Date.now();

    const pastDue = overview.rows.filter((row) => row.status === 'past_due');

    const items = pastDue.slice(0, TRAY_ROW_LIMIT).map((row) => {
      const days = daysPastDue(row.pastDueSince, now);
      return {
        id: `past-due-${row.stripeSubscriptionId}`,
        tone: 'warning' as const,
        icon: 'creditCard' as const,
        title: `${row.communityName} is ${days} ${days === 1 ? 'day' : 'days'} past due`,
        meta: `$${(row.mrrCents / 100).toFixed(2)} / month`,
        href: pastDueHref(row),
        // The failure time, not the read time: a tray row's `occurredAt` is
        // sorted against other providers' real event times, and stamping "now"
        // would float every past-due row to the top of the tray forever.
        occurredAt: row.pastDueSince ?? overview.syncedAt,
      };
    });

    // The BADGE counts every past-due row; the TRAY shows the first few. A badge
    // capped at the tray limit would under-report the queue it is a count of.
    return { count: pastDue.length, items, critical: null };
  },
};
