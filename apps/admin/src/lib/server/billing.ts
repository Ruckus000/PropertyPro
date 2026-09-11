/**
 * Billing READS: the platform subscription portfolio, and one community's
 * billing detail (spec D17, wave 3 slice 3c).
 *
 * ## Stripe is the source of truth, and admin never writes back
 *
 * Every row here is derived from Stripe at read time and joined to
 * `communities` only for a name and an id. `communities.subscription_plan` /
 * `subscription_status` are written by the web app's Stripe webhook and by
 * nothing else — spec D17. This module reads `subscription_plan` as a LABEL
 * (it is the plan name an operator recognises) and never as a fact to act on;
 * `billing-actions.ts` re-retrieves the live subscription before every write.
 *
 * ## Nothing in this file is gated on Stripe mode
 *
 * `billing-actions.ts` refuses to run when the configured key's mode does not
 * match `STRIPE_EXPECTED_LIVEMODE`. The reads deliberately do not: a console
 * that shows nothing because of a mode mismatch is useless for diagnosing the
 * mode mismatch, which is the one thing an operator opens it to do. So in a
 * test-mode deployment the portfolio, the KPIs, the per-community detail and the
 * invoices all work, and only the five writes refuse.
 *
 * They ARE gated on the key EXISTING. An unset `STRIPE_SECRET_KEY` is a
 * configuration state, not a failure, and it gets its own 503 code so the screen
 * can say so rather than rendering an empty portfolio as though Stripe had no
 * subscribers.
 *
 * ## `current_period_end` is on the ITEM in this API version
 *
 * Stripe moved `current_period_end` off `Subscription` and onto
 * `SubscriptionItem`; the SDK pinned here (20.3.1, apiVersion
 * `2026-01-28.clover`) does not declare it on `Subscription` at all.
 * `periodEndOf` reads the item first and falls back to a subscription-level
 * value, because fixtures and older captured payloads carry it there and
 * silently returning `null` for a field the screen renders as a renewal date is
 * worse than accepting both shapes.
 *
 * @module lib/server/billing
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { stripeKeyLivemode } from '@propertypro/shared';
import { AppError } from '@propertypro/shared/http';
import type Stripe from 'stripe';

import { getStripeClient } from '@/lib/stripe';
import { BILLING_CACHE_TTL_MS, withBillingCache } from './billing-cache';
import { bucketByMonth, type MonthPoint } from './dashboard-series';
import type { SignalTone } from './signals/types';

/** One subscription, as the portfolio table and the workspace tab render it. */
export interface BillingRow {
  /** `null` for an ORPHAN — a live Stripe subscription with no community row. */
  communityId: number | null;
  communityName: string;
  plan: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'other';
  /** Normalised to a MONTHLY figure. Annual prices are divided by 12. */
  mrrCents: number;
  interval: 'month' | 'year' | null;
  renewsAt: string | null;
  trialEndsAt: string | null;
  pastDueSince: string | null;
  hasCoupon: boolean;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
}

export interface BillingOverview {
  rows: BillingRow[];
  kpis: {
    /** Sum of `mrrCents` over `active` + `trialing` rows. */
    mrrCents: number;
    /** Latest `revenue_snapshots.mrr_delta_pct`; `null` when there is none. */
    mrrDeltaPct: number | null;
    /** Sum of `mrrCents` over `past_due` rows — money we are not collecting. */
    pastDueCents: number;
    trialsEnding14d: number;
    couponsActive: number;
  };
  /**
   * Monthly MRR history in CENTS, so every money value on this interface is in
   * the same unit. (`dashboard-series` exposes the same snapshot column in
   * DOLLARS for the dashboard's own cards — do not mix the two series.)
   */
  series: MonthPoint[];
  syncedAt: string;
  /** `true` when Stripe has more subscriptions than `MAX_SUBSCRIPTIONS`. */
  truncated: boolean;
}

export interface CommunityBillingInvoice {
  id: string;
  number: string | null;
  date: string;
  amountCents: number;
  status: string;
  hostedUrl: string | null;
}

export interface CommunityBilling {
  row: BillingRow | null;
  invoices: CommunityBillingInvoice[];
  timeline: { text: string; when: string; tone: SignalTone }[];
  stripeDashboardUrl: string;
  /**
   * Which Stripe mode this console is pointed at, derived from the key prefix.
   * Key-derived rather than read off `subscription.livemode` because the screen
   * must be able to say "test mode" for a community that has NO subscription —
   * and because that is the value `billing-actions` gates on, so the badge and
   * the refusal cannot disagree.
   */
  livemode: boolean;
}

/** Five pages of 100. Past this the portfolio reports `truncated`. */
const SUBSCRIPTION_PAGE_SIZE = 100;
const MAX_SUBSCRIPTIONS = 500;

/** Invoices shown on the workspace Billing tab. A year of monthly billing. */
const INVOICE_LIMIT = 12;

/** Months of MRR history in `series`, matching the dashboard's own window. */
const SERIES_MONTHS = 12;

const TRIALS_ENDING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Thrown when `STRIPE_SECRET_KEY` is unset.
 *
 * 503 and its own code, not a 500: there is nothing wrong with the console, it
 * simply has no Stripe credential, and the screen should say that rather than
 * render zero subscribers as a fact.
 */
export class StripeNotConfiguredError extends AppError {
  constructor() {
    super(
      'STRIPE_SECRET_KEY is not set, so Stripe billing cannot be read.',
      503,
      'STRIPE_NOT_CONFIGURED',
    );
    this.name = 'StripeNotConfiguredError';
  }
}

/** `true` when a Stripe credential exists at all. Says nothing about its mode. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function assertStripeConfigured(): void {
  if (!isStripeConfigured()) throw new StripeNotConfiguredError();
}

function toIso(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/** A Stripe id field that is either the id or the expanded object. */
function idOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return '';
}

/**
 * The period end, from wherever this API version put it. See the module
 * docblock — the item is authoritative, the subscription level is the fallback.
 */
function periodEndOf(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0] as { current_period_end?: unknown } | undefined;
  if (typeof item?.current_period_end === 'number') return item.current_period_end;
  const legacy = (sub as unknown as { current_period_end?: unknown }).current_period_end;
  return typeof legacy === 'number' ? legacy : null;
}

function normalizeStatus(status: string): BillingRow['status'] {
  if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'canceled') {
    return status;
  }
  return 'other';
}

/**
 * Stripe subscription → one table row. PURE: no Stripe call, no database read,
 * no clock. Every number the portfolio reports is computed here, which is what
 * makes the MRR arithmetic testable without a Stripe account.
 *
 * `community === undefined` means no `communities` row carries this
 * subscription id — an ORPHAN, which is the single most important thing this
 * screen can surface: a live Stripe subscription still being charged for a
 * community that was deleted, renamed away, or never linked. It gets a
 * recognisable synthetic name rather than being dropped.
 */
export function mapSubscription(
  sub: Stripe.Subscription,
  community: { id: number; name: string; subscription_plan: string | null } | undefined,
): BillingRow {
  const item = sub.items?.data?.[0];
  const price = item?.price as Stripe.Price | undefined;
  const interval = price?.recurring?.interval;
  const normalizedInterval = interval === 'month' || interval === 'year' ? interval : null;

  const unitAmount = price?.unit_amount ?? 0;
  const quantity = item?.quantity ?? 1;
  const gross = unitAmount * quantity;
  // Monthly-normalised, so one column can be summed into an MRR KPI. Annual is
  // divided by 12 and ROUNDED — an un-rounded value would put fractions of a
  // cent into a total that is then formatted as currency.
  const mrrCents = normalizedInterval === 'year' ? Math.round(gross / 12) : gross;

  const status = normalizeStatus(sub.status);
  const periodEnd = periodEndOf(sub);
  const customerId = idOf(sub.customer);

  return {
    communityId: community?.id ?? null,
    communityName: community?.name ?? `Unlinked · ${customerId}`,
    plan: community?.subscription_plan ?? price?.lookup_key ?? 'unknown',
    status,
    mrrCents,
    interval: normalizedInterval,
    renewsAt: toIso(periodEnd),
    trialEndsAt: toIso(sub.trial_end),
    // The period end of a past-due subscription is when collection FAILED — the
    // invoice for the period that just closed is the unpaid one. It is the only
    // date on the object that answers "since when".
    pastDueSince: status === 'past_due' ? toIso(periodEnd) : null,
    hasCoupon: (sub.discounts ?? []).length > 0,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customerId,
  };
}

interface BillingCommunityRow {
  id: number;
  name: string;
  subscription_plan: string | null;
  stripe_subscription_id: string | null;
}

/**
 * Every community that carries a Stripe subscription id, keyed by that id.
 *
 * Demo and soft-deleted rows are included on purpose — see the exempt at the read.
 */
async function loadSubscriptionCommunities(): Promise<Map<string, BillingCommunityRow>> {
  const db = createAdminClient();
  // admin-community-scope:exempt — billing must include DEMO and SOFT-DELETED communities on purpose: a deleted or demo community that still carries a live Stripe subscription is a community we are still charging, which is the single highest-value finding this screen produces. Filtering it out would hide the defect rather than surface it; such a row appears in the portfolio and, if its `communities` row were excluded here, would appear as an unexplained orphan instead of by name.
  const { data, error } = await db
    .from('communities')
    .select('id, name, subscription_plan, stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null)
    .order('id');

  if (error) {
    throw new Error(`Failed to load communities for the billing join: ${error.message}`);
  }

  const bySubscriptionId = new Map<string, BillingCommunityRow>();
  for (const row of (data ?? []) as BillingCommunityRow[]) {
    if (row.stripe_subscription_id) bySubscriptionId.set(row.stripe_subscription_id, row);
  }
  return bySubscriptionId;
}

/** MRR history and the latest delta, from the daily `revenue_snapshots` cron. */
async function loadMrrSeries(
  now: Date,
): Promise<{ series: MonthPoint[]; mrrDeltaPct: number | null }> {
  const db = createAdminClient();
  const cutoffIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - SERIES_MONTHS, 1),
  ).toISOString();

  const { data, error } = await db
    .from('revenue_snapshots')
    .select('computed_at, mrr_cents, mrr_delta_pct')
    .gte('computed_at', cutoffIso)
    .order('computed_at', { ascending: true });

  if (error) throw new Error(`Failed to load revenue snapshots: ${error.message}`);

  const rows = (data ?? []) as {
    computed_at: string;
    mrr_cents: number | string | null;
    mrr_delta_pct: number | string | null;
  }[];

  const series = bucketByMonth(
    rows.map((row) => ({ at: row.computed_at, value: Number(row.mrr_cents ?? 0) })),
    SERIES_MONTHS,
    now,
  );

  // `numeric` arrives from PostgREST as a STRING (precision safety), so an
  // un-coerced value formats as `"12.50"` and compares as a string. A value that
  // does not coerce to a finite number becomes `null` rather than rendering
  // `NaN%` — same rule `dashboard-series.ts` applies to this column.
  const latest = rows.at(-1);
  const rawDelta = latest?.mrr_delta_pct;
  const delta = rawDelta === null || rawDelta === undefined ? null : Number(rawDelta);
  const mrrDeltaPct = delta !== null && Number.isFinite(delta) ? delta : null;

  return { series, mrrDeltaPct };
}

/** Pure: the KPI block, given the rows and a clock. */
export function computeBillingKpis(
  rows: BillingRow[],
  now: Date,
): Omit<BillingOverview['kpis'], 'mrrDeltaPct'> {
  let mrrCents = 0;
  let pastDueCents = 0;
  let trialsEnding14d = 0;
  let couponsActive = 0;

  const nowMs = now.getTime();
  for (const row of rows) {
    if (row.status === 'active' || row.status === 'trialing') mrrCents += row.mrrCents;
    if (row.status === 'past_due') pastDueCents += row.mrrCents;
    if (row.trialEndsAt) {
      // Elapsed milliseconds, not a calendar add: a 14-day window built with a
      // local-calendar helper is 13 or 15 days across a DST boundary. See
      // `packages/shared/src/compliance/posting-deadline.ts` for the same rule.
      const endsMs = Date.parse(row.trialEndsAt);
      if (Number.isFinite(endsMs) && endsMs >= nowMs && endsMs - nowMs <= TRIALS_ENDING_WINDOW_MS) {
        trialsEnding14d += 1;
      }
    }
    if (row.hasCoupon) couponsActive += 1;
  }

  return { mrrCents, pastDueCents, trialsEnding14d, couponsActive };
}

/** List subscriptions, paging to `MAX_SUBSCRIPTIONS`. */
async function listSubscriptions(): Promise<{ subs: Stripe.Subscription[]; truncated: boolean }> {
  const stripe = getStripeClient();
  const subs: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;

  while (subs.length < MAX_SUBSCRIPTIONS) {
    const page = await stripe.subscriptions.list({
      status: 'all',
      limit: SUBSCRIPTION_PAGE_SIZE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    subs.push(...page.data);
    if (!page.has_more || page.data.length === 0) {
      return { subs, truncated: false };
    }
    startingAfter = page.data[page.data.length - 1]!.id;
  }

  // Hit the bound with Stripe still reporting more. Reported, never hidden: a
  // portfolio that silently shows 500 of N makes the MRR KPI a wrong number
  // presented as fact.
  return { subs, truncated: true };
}

/**
 * The whole subscription portfolio, cached five minutes.
 *
 * Filtering by status is the CALLER's job (`filterBillingRows`) so one cache
 * entry serves every filter tab rather than one Stripe read per tab.
 */
export async function getBillingOverview(): Promise<BillingOverview> {
  assertStripeConfigured();

  return withBillingCache(
    'overview',
    async (): Promise<BillingOverview> => {
      const now = new Date();
      const [{ subs, truncated }, communities, { series, mrrDeltaPct }] = await Promise.all([
        listSubscriptions(),
        loadSubscriptionCommunities(),
        loadMrrSeries(now),
      ]);

      const rows = subs.map((sub) => mapSubscription(sub, communities.get(sub.id)));

      return {
        rows,
        kpis: { ...computeBillingKpis(rows, now), mrrDeltaPct },
        series,
        syncedAt: now.toISOString(),
        truncated,
      };
    },
    BILLING_CACHE_TTL_MS,
  );
}

/** Status filter for the portfolio table. Applied after the cached read. */
export function filterBillingRows(rows: BillingRow[], status: string | null): BillingRow[] {
  if (!status || status === 'all') return rows;
  return rows.filter((row) => row.status === status);
}

/**
 * One community's billing detail.
 *
 * Renders for demo and soft-deleted communities too — see the exempt at the read.
 */
export async function getCommunityBilling(communityId: number): Promise<CommunityBilling> {
  assertStripeConfigured();

  const db = createAdminClient();
  // admin-community-scope:exempt — single community by PRIMARY KEY, and deliberately NOT filtered to real communities: the workspace Billing tab must render for a soft-deleted or demo community precisely so an operator can see (and then cancel) a subscription that is still being charged. Filtering here would make the worst case invisible.
  const { data, error } = await db
    .from('communities')
    .select('id, name, subscription_plan, stripe_customer_id, stripe_subscription_id')
    .eq('id', communityId)
    .single();

  if (error || !data) {
    throw new AppError('Community not found', 404, 'NOT_FOUND');
  }

  const community = data as BillingCommunityRow & { stripe_customer_id: string | null };
  // `stripeKeyLivemode` returns `null` for an unrecognised prefix. `=== true`
  // makes unknown read as NOT live, which only affects which Stripe dashboard
  // link is shown; the five WRITES treat unknown as a refusal, in
  // `billing-actions.ts`, which is where fail-closed belongs.
  const livemode = stripeKeyLivemode(process.env.STRIPE_SECRET_KEY) === true;
  const dashboardPrefix = `https://dashboard.stripe.com/${livemode ? '' : 'test/'}`;

  if (!community.stripe_subscription_id) {
    return {
      row: null,
      invoices: [],
      timeline: [],
      stripeDashboardUrl: community.stripe_customer_id
        ? `${dashboardPrefix}customers/${community.stripe_customer_id}`
        : `${dashboardPrefix}subscriptions`,
      livemode,
    };
  }

  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.retrieve(community.stripe_subscription_id);
  const row = mapSubscription(sub, community);

  // Invoices are best-effort: a customer with no invoice history, or a Stripe
  // read that fails, must not take down the rest of the tab — the row and the
  // timeline are the part an operator acts on.
  let invoices: CommunityBillingInvoice[] = [];
  if (row.stripeCustomerId) {
    try {
      const list = await stripe.invoices.list({
        customer: row.stripeCustomerId,
        limit: INVOICE_LIMIT,
      });
      invoices = list.data.map((invoice) => ({
        id: invoice.id ?? '',
        number: invoice.number ?? null,
        date: new Date((invoice.created ?? 0) * 1000).toISOString(),
        amountCents: invoice.amount_due ?? 0,
        status: invoice.status ?? 'unknown',
        hostedUrl: invoice.hosted_invoice_url ?? null,
      }));
    } catch {
      invoices = [];
    }
  }

  return {
    row,
    invoices,
    timeline: buildTimeline(sub, row),
    stripeDashboardUrl: `${dashboardPrefix}subscriptions/${sub.id}`,
    livemode,
  };
}

/**
 * Pure: the subscription's own lifecycle dates as a short, tonal list.
 *
 * Derived entirely from the Stripe object — there is no stored billing event
 * log, and inventing one would duplicate a source of truth we do not own.
 */
export function buildTimeline(
  sub: Stripe.Subscription,
  row: BillingRow,
): { text: string; when: string; tone: SignalTone }[] {
  const entries: { text: string; when: string; tone: SignalTone }[] = [];

  const created = toIso(sub.created);
  if (created) entries.push({ text: 'Subscription created', when: created, tone: 'neutral' });

  if (row.trialEndsAt) {
    entries.push({
      text: Date.parse(row.trialEndsAt) > Date.now() ? 'Trial ends' : 'Trial ended',
      when: row.trialEndsAt,
      tone: 'info',
    });
  }

  if (row.pastDueSince) {
    entries.push({ text: 'Payment failed', when: row.pastDueSince, tone: 'danger' });
  }

  if (sub.pause_collection) {
    entries.push({
      text: `Collection paused (${sub.pause_collection.behavior})`,
      when: toIso(sub.pause_collection.resumes_at) ?? row.renewsAt ?? new Date(0).toISOString(),
      tone: 'warning',
    });
  }

  if (sub.cancel_at_period_end && row.renewsAt) {
    entries.push({ text: 'Cancels at period end', when: row.renewsAt, tone: 'danger' });
  }

  const canceledAt = toIso(sub.canceled_at);
  if (canceledAt) entries.push({ text: 'Subscription canceled', when: canceledAt, tone: 'danger' });

  return entries.sort((a, b) => Date.parse(b.when) - Date.parse(a.when));
}
