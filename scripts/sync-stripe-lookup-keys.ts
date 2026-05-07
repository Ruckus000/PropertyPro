/**
 * Sync Stripe Price `lookup_key` fields from our stripe_prices table.
 *
 * Context: PropertyPro's plan-gate writer (customer.subscription.updated webhook)
 * prefers `price.lookup_key` and falls back to a DB lookup. When `lookup_key` is
 * set correctly on the Stripe side, the primary path stays hot and we don't
 * incur an extra DB read on every subscription update.
 *
 * This script reads all rows from `stripe_prices`, computes the canonical
 * `lookup_key = ${planId}_${communityType}_monthly`, and calls
 * `stripe.prices.update(priceId, { lookup_key })` for any price whose
 * current Stripe lookup_key is null or mismatched.
 *
 * Dry-run by default. Pass `--apply` to commit changes.
 *
 * Usage:
 *   scripts/with-env-local.sh pnpm tsx scripts/sync-stripe-lookup-keys.ts
 *   scripts/with-env-local.sh pnpm tsx scripts/sync-stripe-lookup-keys.ts --apply
 */
import Stripe from 'stripe';
import { stripePrices } from '@propertypro/db';
// AUTHZ: CLI/seed script — runs out-of-band of tenant scoping with explicit operator authorization.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { runOpsScript } from './lib/run-ops-script';

interface Row {
  id: number;
  planId: string;
  communityType: string;
  billingInterval: string;
  stripePriceId: string;
}

interface PlanOutcome {
  priceId: string;
  planId: string;
  communityType: string;
  interval: string;
  currentLookupKey: string | null;
  desiredLookupKey: string;
  action: 'skip-match' | 'update' | 'error';
  errorMessage?: string;
}

function canonicalLookupKey(row: Pick<Row, 'planId' | 'communityType' | 'billingInterval'>): string {
  // billing_interval is stored as 'month' / 'year' but lookup key convention uses 'monthly' / 'yearly'.
  const intervalSuffix = row.billingInterval === 'month' ? 'monthly'
    : row.billingInterval === 'year' ? 'yearly'
    : row.billingInterval;
  return `${row.planId}_${row.communityType}_${intervalSuffix}`;
}

async function run(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set. Aborting.');
  }
  const apply = process.argv.slice(2).includes('--apply');

  const stripe = new Stripe(secretKey);
  const db = createUnscopedClient();

  const rows = (await db
    .select({
      id: stripePrices.id,
      planId: stripePrices.planId,
      communityType: stripePrices.communityType,
      billingInterval: stripePrices.billingInterval,
      stripePriceId: stripePrices.stripePriceId,
    })
    .from(stripePrices)) as Row[];

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('stripe_prices table is empty — nothing to sync.');
    return;
  }

  const outcomes: PlanOutcome[] = [];

  for (const row of rows) {
    const desired = canonicalLookupKey(row);
    let currentLookupKey: string | null = null;
    try {
      const price = await stripe.prices.retrieve(row.stripePriceId);
      currentLookupKey = price.lookup_key ?? null;
    } catch (err) {
      outcomes.push({
        priceId: row.stripePriceId,
        planId: row.planId,
        communityType: row.communityType,
        interval: row.billingInterval,
        currentLookupKey: null,
        desiredLookupKey: desired,
        action: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (currentLookupKey === desired) {
      outcomes.push({
        priceId: row.stripePriceId,
        planId: row.planId,
        communityType: row.communityType,
        interval: row.billingInterval,
        currentLookupKey,
        desiredLookupKey: desired,
        action: 'skip-match',
      });
      continue;
    }

    if (!apply) {
      outcomes.push({
        priceId: row.stripePriceId,
        planId: row.planId,
        communityType: row.communityType,
        interval: row.billingInterval,
        currentLookupKey,
        desiredLookupKey: desired,
        action: 'update',
      });
      continue;
    }

    try {
      await stripe.prices.update(row.stripePriceId, {
        lookup_key: desired,
        // transfer_lookup_key: reassigns the key from whichever price currently owns it.
        // Safe here because our stripe_prices table is the source of truth and each
        // (planId, communityType, interval) maps to exactly one active price.
        transfer_lookup_key: true,
      });
      outcomes.push({
        priceId: row.stripePriceId,
        planId: row.planId,
        communityType: row.communityType,
        interval: row.billingInterval,
        currentLookupKey,
        desiredLookupKey: desired,
        action: 'update',
      });
    } catch (err) {
      outcomes.push({
        priceId: row.stripePriceId,
        planId: row.planId,
        communityType: row.communityType,
        interval: row.billingInterval,
        currentLookupKey,
        desiredLookupKey: desired,
        action: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nSync lookup_keys for ${rows.length} stripe_prices row(s) — ${apply ? 'APPLY' : 'DRY-RUN'}:`);
  // eslint-disable-next-line no-console
  console.table(
    outcomes.map((o) => ({
      price_id: o.priceId,
      plan: o.planId,
      community_type: o.communityType,
      interval: o.interval,
      current_lookup_key: o.currentLookupKey ?? '(null)',
      desired_lookup_key: o.desiredLookupKey,
      action: o.action,
      error: o.errorMessage ?? '',
    })),
  );

  const errors = outcomes.filter((o) => o.action === 'error');
  const updates = outcomes.filter((o) => o.action === 'update');
  const matches = outcomes.filter((o) => o.action === 'skip-match');

  // eslint-disable-next-line no-console
  console.log(
    `\nSummary: ${matches.length} already correct, ${updates.length} ${apply ? 'updated' : 'would update'}, ${errors.length} errors.`,
  );

  if (!apply && updates.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\nRe-run with --apply to commit the shown changes.');
  }

  if (errors.length > 0) {
    throw new Error(`${errors.length} error(s) encountered while syncing lookup keys.`);
  }
}

void runOpsScript({ name: 'sync-stripe-lookup-keys', url: import.meta.url, run });
