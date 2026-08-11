/**
 * The Stripe price catalog: which Products/Prices this app needs, how to create
 * them idempotently, and how to point `stripe_prices` at them.
 *
 * Shared by the two seeding entrypoints — `seed-stripe-test-prices.ts` and
 * `seed-stripe-live-prices.ts`. They exist as SEPARATE entrypoints on purpose.
 * Each carries its own absolute refusal (test ⇒ `sk_test_` + a loopback
 * database; live ⇒ `sk_live_` + an explicit acknowledgement flag), and the value
 * of a guard with no override is exactly that it has no override. Collapsing
 * them into one mode-parameterised script would be less code and a worse
 * program: the parameter becomes the override.
 *
 * Everything mode-specific therefore lives in the entrypoints. Nothing in this
 * file inspects the key or decides whether an operation is safe.
 *
 * This module imports NO database code on purpose. `@propertypro/db`'s barrel
 * evaluates `drizzle.ts`, which throws `Missing DATABASE_URL` at import time —
 * so pulling it in here would make every pure catalog test unrunnable without a
 * database. The writes live in `./stripe-price-writer.ts`.
 */
import type Stripe from 'stripe';
import {
  COMMUNITY_TYPES,
  PLANS_BY_COMMUNITY_TYPE,
  PLAN_MONTHLY_PRICES_USD,
  type CommunityType,
  type PlanId,
} from '@propertypro/shared';

export const PLAN_LABELS: Record<PlanId, string> = {
  essentials: 'Essentials',
  professional: 'Professional',
  operations_plus: 'Operations Plus',
};

export const TYPE_LABELS: Record<CommunityType, string> = {
  condo_718: 'Condominium (§718)',
  hoa_720: 'HOA (§720)',
  apartment: 'Apartment',
};

export interface Combo {
  planId: PlanId;
  communityType: CommunityType;
  billingInterval: 'month' | 'year';
  unitAmountCents: number;
  lookupKey: string;
}

/**
 * `<plan>_<communityType>_<monthly|yearly>`.
 *
 * Must stay identical to `canonicalLookupKey` in `sync-stripe-lookup-keys.ts`:
 * the `customer.subscription.updated` webhook prefers `price.lookup_key` and
 * only falls back to a DB read, so a divergence here silently moves that path
 * onto its slow branch instead of failing.
 */
export function lookupKeyFor(
  planId: PlanId,
  communityType: CommunityType,
  interval: 'month' | 'year',
): string {
  return `${planId}_${communityType}_${interval === 'month' ? 'monthly' : 'yearly'}`;
}

/**
 * Every (plan × community type × interval) the app can sell.
 *
 * Annual is priced at ten months — the same rule `seed-demo.ts` uses, so a
 * seeded environment and a real one agree.
 */
export function allCombos(): Combo[] {
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

/** Reuse an active price with this lookup_key, or create product + price. */
export async function ensurePrice(
  stripe: Stripe,
  combo: Combo,
  seededBy: string,
): Promise<{ priceId: string; created: boolean }> {
  const existing = await stripe.prices.list({
    lookup_keys: [combo.lookupKey],
    active: true,
    limit: 1,
  });
  const found = existing.data[0];
  if (found) return { priceId: found.id, created: false };

  const product = await stripe.products.create({
    name: `PropertyPro ${PLAN_LABELS[combo.planId]} — ${TYPE_LABELS[combo.communityType]}`,
    metadata: { planId: combo.planId, communityType: combo.communityType, seededBy },
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

/** What a single combo would do / did. Rendered with `console.table`. */
export interface ComboOutcome extends Record<string, string | number> {
  plan: string;
  community_type: string;
  interval: string;
  amount_usd: number;
  lookup_key: string;
  action: 'would-create' | 'reuse-existing' | 'created' | 'reused';
}

export function describeCombo(combo: Combo, action: ComboOutcome['action']): ComboOutcome {
  return {
    plan: combo.planId,
    community_type: combo.communityType,
    interval: combo.billingInterval,
    amount_usd: combo.unitAmountCents / 100,
    lookup_key: combo.lookupKey,
    action,
  };
}
