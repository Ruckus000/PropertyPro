#!/usr/bin/env tsx
/**
 * Create the Stripe **test-mode** Products/Prices this app needs, and point the
 * local `stripe_prices` table at them.
 *
 * Why this exists: `pnpm seed:demo` fills `stripe_prices` with
 * `price_placeholder_…` ids, which no Stripe account can resolve — so the very
 * first Checkout attempt fails inside `resolveStripePrice`
 * (`assertPriceRetrievable` → `STRIPE_MODE_MISMATCH` / `resource_missing`) and
 * `/signup/checkout` renders "Unable to start checkout". Without this script the
 * signup → Checkout → trialing path cannot be exercised at all.
 *
 * The catalog itself (combos, amounts, lookup keys, the upsert) lives in
 * `./lib/stripe-price-catalog.ts` and is shared with the live seeder. Everything
 * mode-specific — the two refusals below — stays here.
 *
 * SAFETY — this script refuses to run unless BOTH are true:
 *   1. `STRIPE_SECRET_KEY` starts with `sk_test_` (never touch the live account).
 *   2. `DATABASE_URL` resolves to a loopback host (never repoint a shared
 *      environment's price table at test-mode ids — a live key cannot resolve a
 *      test price, so that breaks checkout for every real customer at once).
 * Neither has an override flag: the only reason to want one is the mistake.
 *
 * For the live account use `seed-stripe-live-prices.ts`, which carries its own
 * (different) refusals.
 *
 * Usage:
 *   scripts/with-env-local-demo-db.sh pnpm tsx scripts/seed-stripe-test-prices.ts
 *   scripts/with-env-local-demo-db.sh pnpm tsx scripts/seed-stripe-test-prices.ts --apply
 */
import Stripe from 'stripe';
// AUTHZ: CLI/seed script — runs out-of-band of tenant scoping with explicit operator authorization.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { runOpsScript } from './lib/run-ops-script';
import { seedPriceCatalog } from './lib/stripe-price-writer';
import { assertLoopbackDatabase, assertKeyMode } from './lib/stripe-guards';

async function run(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const secretKey = process.env.STRIPE_SECRET_KEY;

  assertKeyMode(secretKey, false, {
    because:
      'This script creates Products and Prices; against a live key that means real billing ' +
      'objects in the real account.',
  });
  assertLoopbackDatabase(process.env.DATABASE_URL, {
    because:
      'Writing TEST-mode price ids into a non-local stripe_prices table would break checkout ' +
      'for every real customer, because a live key cannot resolve a test price.',
  });

  const outcomes = await seedPriceCatalog({
    stripe: new Stripe(secretKey),
    db: createUnscopedClient(),
    apply,
    seededBy: 'seed-stripe-test-prices',
  });

  // eslint-disable-next-line no-console
  console.log(`\nStripe TEST-mode prices — ${apply ? 'APPLY' : 'DRY-RUN'}:`);
  // eslint-disable-next-line no-console
  console.table(outcomes);

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log('\nRe-run with --apply to create the prices and update stripe_prices.');
  }
}

void runOpsScript({ name: 'seed-stripe-test-prices', url: import.meta.url, run });
