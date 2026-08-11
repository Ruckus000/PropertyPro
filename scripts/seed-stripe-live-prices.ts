#!/usr/bin/env tsx
/**
 * Create the Stripe **LIVE-mode** Products/Prices this app needs, and point the
 * target `stripe_prices` table at them.
 *
 * This is a cutover step, not routine maintenance. Read
 * `docs/runbooks/stripe-live-cutover.md` first — running this alone leaves the
 * environment in a MIXED state (live price ids, still-test key), which fails
 * every checkout until the keys are rotated too.
 *
 * SAFETY — refuses to run unless ALL of:
 *   1. `STRIPE_SECRET_KEY` starts with `sk_live_`/`rk_live_`. A test key here
 *      would write test ids into a table the live key cannot resolve.
 *   2. `--apply` is present for any write at all (dry-run is the default, and a
 *      dry run touches neither Stripe nor the database).
 *   3. `--i-understand-this-creates-live-billing-objects` is present alongside
 *      `--apply`. Products and Prices created here are real, appear on real
 *      invoices, and cannot be deleted from Stripe — only deactivated.
 *
 * Idempotent: prices are matched by `lookup_key` and reused when present, so
 * re-running never mints duplicates. Safe to re-run after a partial failure.
 *
 * Deliberately NOT guarded on the database host. The whole point is to write to
 * a shared environment; the mode agreement in (1) is what makes that safe, and
 * `verify-stripe-mode.ts` is how you confirm the result.
 *
 * Usage:
 *   pnpm tsx scripts/seed-stripe-live-prices.ts                     # dry run
 *   pnpm tsx scripts/seed-stripe-live-prices.ts --apply \
 *     --i-understand-this-creates-live-billing-objects
 */
import Stripe from 'stripe';
// AUTHZ: CLI/ops script — runs out-of-band of tenant scoping with explicit operator authorization.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { runOpsScript } from './lib/run-ops-script';
import { seedPriceCatalog } from './lib/stripe-price-writer';
import { assertAcknowledged, assertKeyMode, databaseHost } from './lib/stripe-guards';

const ACK_FLAG = '--i-understand-this-creates-live-billing-objects';

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const secretKey = process.env.STRIPE_SECRET_KEY;

  assertKeyMode(secretKey, true, {
    because:
      'This script creates LIVE Products and Prices. Against a test key it would write test ' +
      'ids into a table the live key cannot resolve, breaking every checkout.',
  });

  if (apply) {
    assertAcknowledged(argv, ACK_FLAG, {
      because:
        'This creates REAL billing objects in the live Stripe account. They appear on real ' +
        'invoices and cannot be deleted from Stripe, only deactivated.',
    });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set. Aborting.');

  // Say out loud which database is about to be repointed. The failure this
  // prevents is running a correct command against the wrong environment.
  // eslint-disable-next-line no-console
  console.log(
    `\nStripe LIVE-mode prices — ${apply ? 'APPLY' : 'DRY-RUN'}\n` +
      `  database host: ${databaseHost(dbUrl)}\n`,
  );

  const outcomes = await seedPriceCatalog({
    stripe: new Stripe(secretKey),
    db: createUnscopedClient(),
    apply,
    seededBy: 'seed-stripe-live-prices',
  });

  // eslint-disable-next-line no-console
  console.table(outcomes);

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log(
      `\nNothing was written — neither Stripe nor the database was touched.\n` +
        `Re-run with --apply ${ACK_FLAG} to commit,\n` +
        `then run scripts/verify-stripe-mode.ts to confirm the environment agrees with itself.`,
    );
  }
}

void runOpsScript({ name: 'seed-stripe-live-prices', url: import.meta.url, run });
