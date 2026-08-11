#!/usr/bin/env tsx
/**
 * Preflight: is this environment's Stripe configuration internally consistent?
 *
 * Stripe mode lives in FOUR independent places — the secret key, the publishable
 * key, the `stripe_prices` rows, and the webhook endpoint's signing secret — and
 * nothing in the app checks that they agree. The first thing that notices a
 * disagreement today is a customer, at checkout, seeing "Unable to start
 * checkout". This script is how you find out first.
 *
 * Read-only. It never writes to Stripe or the database, so it is safe to run
 * against production at any time, and is a required step in
 * `docs/runbooks/stripe-live-cutover.md` — before AND after the cutover.
 *
 * Exits non-zero if any check is `fail` or `unknown`. `unknown` is deliberately
 * not a pass: "I could not tell" must never render as green.
 *
 * NEVER prints a key. Reports show the mode-bearing prefix and last 4 only.
 *
 * Usage:
 *   pnpm tsx scripts/verify-stripe-mode.ts
 *   scripts/with-env-local-demo-db.sh pnpm tsx scripts/verify-stripe-mode.ts
 */
import Stripe from 'stripe';
import { communities, billingGroups, stripePrices } from '@propertypro/db';
import { isNotNull } from '@propertypro/db/filters';
// AUTHZ: CLI/ops script — read-only preflight; runs out-of-band of tenant scoping with explicit operator authorization.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  redactStripeKey,
  stripeKeyLivemode,
  stripePublishableKeyLivemode,
} from '@propertypro/shared';
import { runOpsScript } from './lib/run-ops-script';
import { databaseHost } from './lib/stripe-guards';
import { allCombos, lookupKeyFor } from './lib/stripe-price-catalog';
import {
  isFailing,
  keyModeCheck,
  priceCheck,
  publishableKeyCheck,
  staleIdCheck,
  webhookSecretCheck,
  type Check,
  type PriceProbe,
} from './lib/stripe-mode-report';

/** Does this id exist for the configured key? Any non-missing error re-throws. */
async function resolves(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError && err.code === 'resource_missing') return false;
    // A network blip or a permissions problem must NOT be reported as "stale".
    throw err;
  }
}

async function run(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const secretLivemode = stripeKeyLivemode(secretKey);

  const checks: Check[] = [
    keyModeCheck(secretLivemode, redactStripeKey(secretKey)),
    publishableKeyCheck(
      secretLivemode,
      stripePublishableKeyLivemode(publishableKey),
      redactStripeKey(publishableKey),
    ),
  ];

  // Without a usable key there is nothing to probe against; report what we have
  // rather than throwing a confusing Stripe auth error.
  if (secretKey && secretLivemode !== null) {
    const stripe = new Stripe(secretKey);
    const db = createUnscopedClient();

    const expectedByLookupKey = new Map(allCombos().map((c) => [c.lookupKey, c.unitAmountCents]));

    const priceRows = await db
      .select({
        planId: stripePrices.planId,
        communityType: stripePrices.communityType,
        billingInterval: stripePrices.billingInterval,
        stripePriceId: stripePrices.stripePriceId,
        unitAmountCents: stripePrices.unitAmountCents,
      })
      .from(stripePrices);

    const probes: PriceProbe[] = [];
    for (const row of priceRows) {
      const lookupKey = lookupKeyFor(
        row.planId as Parameters<typeof lookupKeyFor>[0],
        row.communityType as Parameters<typeof lookupKeyFor>[1],
        row.billingInterval === 'year' ? 'year' : 'month',
      );
      let actual: number | null = null;
      const ok = await resolves(async () => {
        const price = await stripe.prices.retrieve(row.stripePriceId);
        actual = price.unit_amount;
      });
      probes.push({
        lookupKey,
        stripePriceId: row.stripePriceId,
        resolved: ok,
        actualUnitAmountCents: actual,
        // Prefer the catalog; fall back to the stored amount for a row whose
        // (plan, type, interval) the catalog no longer sells.
        expectedUnitAmountCents: expectedByLookupKey.get(lookupKey) ?? row.unitAmountCents,
      });
    }
    checks.push(priceCheck(probes));

    const communityRows = await db
      .select({ id: communities.id, customerId: communities.stripeCustomerId })
      .from(communities)
      .where(isNotNull(communities.stripeCustomerId));

    let staleCommunities = 0;
    for (const row of communityRows) {
      if (!row.customerId) continue;
      const ok = await resolves(() => stripe.customers.retrieve(row.customerId as string));
      if (!ok) staleCommunities += 1;
    }

    const groupRows = await db
      .select({ id: billingGroups.id, customerId: billingGroups.stripeCustomerId })
      .from(billingGroups);

    let staleGroups = 0;
    for (const row of groupRows) {
      const ok = await resolves(() => stripe.customers.retrieve(row.customerId));
      if (!ok) staleGroups += 1;
    }

    checks.push(staleIdCheck({ communities: staleCommunities, billingGroups: staleGroups }));
  }

  checks.push(webhookSecretCheck(process.env.STRIPE_WEBHOOK_SECRET));

  const dbUrl = process.env.DATABASE_URL;
  // eslint-disable-next-line no-console
  console.log(`\nStripe mode preflight — database host: ${dbUrl ? databaseHost(dbUrl) : '(unset)'}\n`);
  // eslint-disable-next-line no-console
  console.table(checks.map((c) => ({ check: c.name, status: c.status, detail: c.detail })));

  if (isFailing(checks)) {
    throw new Error(
      'Stripe configuration is NOT verified. Every check must be "pass" — "unknown" counts as ' +
        'unverified, not as green. See docs/runbooks/stripe-live-cutover.md.',
    );
  }

  // eslint-disable-next-line no-console
  console.log('All checks passed — this environment agrees with itself.');
}

void runOpsScript({ name: 'verify-stripe-mode', url: import.meta.url, run });
