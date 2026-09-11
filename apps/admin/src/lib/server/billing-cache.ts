/**
 * Billing's five-minute instance of the shared TTL cache.
 *
 * ## Why cache at all
 *
 * `getBillingOverview` pages `stripe.subscriptions.list` up to five times and
 * then joins the result to `communities`. Every shell render asks the billing
 * SIGNAL provider for a past-due count, and the `/billing` screen asks for the
 * same data again; uncached, opening one page would cost ten Stripe round-trips
 * and put the console's own responsiveness on Stripe's latency.
 *
 * ## Why its OWN instance
 *
 * The mechanism lives in `ttl-cache.ts` and the Health board uses it too. They
 * hold separate instances because `invalidateBillingCache()` is called after
 * every money action, and a health probe reading has no reason to be discarded
 * at that moment. Sharing one map would couple two unrelated freshness policies
 * through an invisible generation counter.
 *
 * ## What this is NOT
 *
 * It is not a source of truth and it is not shared across processes — see
 * `ttl-cache.ts`. Nothing here is authoritative: Stripe is the source of truth
 * for every value in it (spec D17 — admin never writes
 * `communities.subscription_*`), and the only thing a stale entry can cause is a
 * number on a screen being up to five minutes old.
 *
 * It must therefore never be used to DECIDE anything. The five subscription
 * actions all re-`retrieve` the live subscription from Stripe rather than
 * reading a row out of here — a cached `trial_end` or price id is exactly the
 * kind of value that, used as the basis for a write, charges the wrong amount.
 *
 * ## Why every action invalidates it
 *
 * An operator who extends a trial and is then shown the pre-change trial end for
 * five minutes will reasonably extend it again. `invalidateBillingCache()` after
 * each successful write makes the next read go to Stripe.
 *
 * @module lib/server/billing-cache
 */
import { createTtlCache } from './ttl-cache';

/** Five minutes. One place, so the overview and the signal provider agree. */
export const BILLING_CACHE_TTL_MS = 5 * 60 * 1000;

const billingCache = createTtlCache(BILLING_CACHE_TTL_MS);

/**
 * Serve `key` from the billing cache, or run `load` and remember it.
 *
 * Kept under this name, with this signature, because `billing.ts` and the tests
 * that pin its behaviour call it — the extraction below it is not meant to be
 * visible from here.
 */
export async function withBillingCache<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs: number = BILLING_CACHE_TTL_MS,
  now: number = Date.now(),
): Promise<T> {
  return billingCache.get(key, load, ttlMs, now);
}

/**
 * Drop every cached billing read.
 *
 * Called by each of the five subscription actions after Stripe has accepted the
 * write. Deliberately whole-cache rather than per-key: the overview is a
 * platform-wide aggregate, so a single community's plan change moves the MRR KPI
 * and the row, and there is no per-community key to evict.
 *
 * It deliberately does NOT touch the health cache. A plan change says nothing
 * about whether Resend is up.
 */
export function invalidateBillingCache(): void {
  billingCache.invalidate();
}
