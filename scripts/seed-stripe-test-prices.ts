/**
 * Create the Stripe **test-mode** Products/Prices this app needs, and point the
 * local `stripe_prices` table at them.
 *
 * Why this exists: `pnpm seed:demo` fills `stripe_prices` with
 * `price_placeholder_…` ids, which no Stripe account can resolve — so the very
 * first Checkout attempt fails inside `resolveStripePrice`
 * (`assertPriceRetrievable` → `STRIPE_MODE_MISMATCH` / `resource_missing`) and
 * `/signup/checkout` renders "Unable to start checkout". Production has real
 * LIVE ids; test mode needs its own, and nothing created them until now. Without
 * this script the signup → Checkout → trialing path cannot be exercised at all.
 *
 * Idempotent: prices are looked up by `lookup_key` and reused when present, so
 * re-running never mints duplicates. The `lookup_key` convention matches
 * `sync-stripe-lookup-keys.ts` (`<plan>_<communityType>_<monthly|yearly>`),
 * which keeps the webhook's primary plan-resolution path hot.
 *
 * Amounts come from `PLAN_MONTHLY_PRICES_USD`, with an annual term priced at ten
 * months — the same rule `seed-demo.ts` uses for its placeholders.
 *
 * SAFETY — this script refuses to run unless BOTH are true:
 *   1. `STRIPE_SECRET_KEY` starts with `sk_test_` (never touch the live account).
 *   2. `DATABASE_URL` resolves to a loopback host (never repoint prod's price
 *      table at test-mode ids — that would break every real customer's checkout).
 * Neither has an override flag: the only reason to want one is the mistake.
 *
 * Usage:
 *   scripts/with-env-local-demo-db.sh pnpm tsx scripts/seed-stripe-test-prices.ts
 *   scripts/with-env-local-demo-db.sh pnpm tsx scripts/seed-stripe-test-prices.ts --apply
 */
import Stripe from 'stripe';
import { stripePrices } from '@propertypro/db';
// AUTHZ: CLI/seed script — runs out-of-band of tenant scoping with explicit operator authorization.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  COMMUNITY_TYPES,
  PLANS_BY_COMMUNITY_TYPE,
  PLAN_MONTHLY_PRICES_USD,
  type CommunityType,
  type PlanId,
} from '@propertypro/shared';
import { runOpsScript } from './lib/run-ops-script';

const PLAN_LABELS: Record<PlanId, string> = {
  essentials: 'Essentials',
  professional: 'Professional',
  operations_plus: 'Operations Plus',
};

const TYPE_LABELS: Record<CommunityType, string> = {
  condo_718: 'Condominium (§718)',
  hoa_720: 'HOA (§720)',
  apartment: 'Apartment',
};

interface Combo {
  planId: PlanId;
  communityType: CommunityType;
  billingInterval: 'month' | 'year';
  unitAmountCents: number;
  lookupKey: string;
}

function lookupKeyFor(planId: PlanId, communityType: CommunityType, interval: 'month' | 'year'): string {
  return `${planId}_${communityType}_${interval === 'month' ? 'monthly' : 'yearly'}`;
}

function allCombos(): Combo[] {
  return COMMUNITY_TYPES.flatMap((communityType) =>
    PLANS_BY_COMMUNITY_TYPE[communityType].flatMap((planId) =>
      (['month', 'year'] as const).map((billingInterval) => {
        const monthlyCents = PLAN_MONTHLY_PRICES_USD[planId] * 100;
        return {
          planId,
          communityType,
          billingInterval,
          unitAmountCents: billingInterval === 'year' ? monthlyCents * 10 : monthlyCents,
          lookupKey: lookupKeyFor(planId, communityType, billingInterval),
        };
      }),
    ),
  );
}

function assertTestModeKey(key: string | undefined): asserts key is string {
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set. Aborting.');
  if (!key.startsWith('sk_test_')) {
    throw new Error(
      'REFUSING TO RUN — STRIPE_SECRET_KEY is not a test-mode key (expected an "sk_test_" prefix). ' +
        'This script creates Products and Prices; against a live key that means real billing objects ' +
        'in the real account.',
    );
  }
}

function assertLocalDatabase(url: string | undefined): void {
  if (!url) throw new Error('DATABASE_URL is not set. Aborting.');
  const host = url
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    .replace(/^[^@/]*@/, '')
    .replace(/[/?].*$/, '')
    .replace(/:\d+$/, '');
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'host.docker.internal'];
  if (!loopback.includes(host)) {
    throw new Error(
      `REFUSING TO RUN — DATABASE_URL host "${host}" is not loopback. Writing TEST-mode price ids ` +
        'into a non-local stripe_prices table would break checkout for every real customer, because ' +
        'the live key cannot resolve a test price.',
    );
  }
}

/** Reuse an existing test price with this lookup_key, or create product + price. */
async function ensurePrice(stripe: Stripe, combo: Combo): Promise<{ priceId: string; created: boolean }> {
  const existing = await stripe.prices.list({
    lookup_keys: [combo.lookupKey],
    active: true,
    limit: 1,
  });
  const found = existing.data[0];
  if (found) return { priceId: found.id, created: false };

  const product = await stripe.products.create({
    name: `PropertyPro ${PLAN_LABELS[combo.planId]} — ${TYPE_LABELS[combo.communityType]}`,
    metadata: { planId: combo.planId, communityType: combo.communityType, seededBy: 'seed-stripe-test-prices' },
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: combo.unitAmountCents,
    recurring: { interval: combo.billingInterval },
    lookup_key: combo.lookupKey,
    metadata: { planId: combo.planId, communityType: combo.communityType },
  });

  return { priceId: price.id, created: true };
}

async function run(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const secretKey = process.env.STRIPE_SECRET_KEY;
  assertTestModeKey(secretKey);
  assertLocalDatabase(process.env.DATABASE_URL);

  const stripe = new Stripe(secretKey);
  const db = createUnscopedClient();
  const combos = allCombos();

  const report: Array<Record<string, string | number>> = [];

  for (const combo of combos) {
    if (!apply) {
      const existing = await stripe.prices.list({
        lookup_keys: [combo.lookupKey],
        active: true,
        limit: 1,
      });
      report.push({
        plan: combo.planId,
        community_type: combo.communityType,
        interval: combo.billingInterval,
        amount_usd: combo.unitAmountCents / 100,
        lookup_key: combo.lookupKey,
        action: existing.data[0] ? 'reuse-existing' : 'would-create',
      });
      continue;
    }

    const { priceId, created } = await ensurePrice(stripe, combo);

    // Upsert on the business key, so re-running repoints a placeholder row
    // rather than colliding on the unique (plan, type, interval) index.
    await db
      .insert(stripePrices)
      .values({
        planId: combo.planId,
        communityType: combo.communityType,
        billingInterval: combo.billingInterval,
        stripePriceId: priceId,
        unitAmountCents: combo.unitAmountCents,
      })
      .onConflictDoUpdate({
        target: [stripePrices.planId, stripePrices.communityType, stripePrices.billingInterval],
        set: {
          stripePriceId: priceId,
          unitAmountCents: combo.unitAmountCents,
          updatedAt: new Date(),
        },
      });

    report.push({
      plan: combo.planId,
      community_type: combo.communityType,
      interval: combo.billingInterval,
      amount_usd: combo.unitAmountCents / 100,
      lookup_key: combo.lookupKey,
      action: created ? 'created' : 'reused',
    });
  }

  // eslint-disable-next-line no-console
  console.log(`\nStripe TEST-mode prices — ${apply ? 'APPLY' : 'DRY-RUN'}:`);
  // eslint-disable-next-line no-console
  console.table(report);

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log('\nRe-run with --apply to create the prices and update stripe_prices.');
  }
}

void runOpsScript({ name: 'seed-stripe-test-prices', url: import.meta.url, run });
