/**
 * One-time backfill: populate stripe_prices.unit_amount_cents from the Stripe API.
 *
 * Idempotent — skips rows that already have a value. Safe to rerun.
 *
 * Usage: scripts/with-env-local.sh pnpm tsx scripts/backfill-stripe-price-amounts.ts
 */
import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';
import { eq, isNull } from '@propertypro/db/filters';
import { stripePrices } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // eslint-disable-next-line no-console
    console.error('STRIPE_SECRET_KEY not set');
    process.exit(1);
  }
  const stripe = new Stripe(secretKey);
  const db = createUnscopedClient();

  const rows = await db
    .select()
    .from(stripePrices)
    .where(isNull(stripePrices.unitAmountCents));

  // eslint-disable-next-line no-console
  console.log(`Found ${rows.length} rows needing backfill`);

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const price = await stripe.prices.retrieve(row.stripePriceId);
      if (price.unit_amount === null) {
        // eslint-disable-next-line no-console
        console.warn(`Stripe price ${row.stripePriceId} has null unit_amount; skipping`);
        failed += 1;
        continue;
      }
      await db
        .update(stripePrices)
        .set({ unitAmountCents: price.unit_amount, updatedAt: new Date() })
        .where(eq(stripePrices.id, row.id));
      // eslint-disable-next-line no-console
      console.log(`Updated ${row.stripePriceId} -> ${price.unit_amount}`);
      ok += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed ${row.stripePriceId}:`, err);
      failed += 1;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Done. OK=${ok} FAILED=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[backfill] failed:', error);
    process.exitCode = 1;
  });
}
