/**
 * The database half of the Stripe price catalog.
 *
 * Split from `./stripe-price-catalog.ts` because importing `@propertypro/db`
 * evaluates `drizzle.ts`, which throws `Missing DATABASE_URL` at import time.
 * Keeping the catalog itself db-free is what lets it be unit-tested without a
 * database; anything that writes belongs here.
 */
import type Stripe from 'stripe';
import { stripePrices } from '@propertypro/db';
import {
  allCombos,
  describeCombo,
  ensurePrice,
  type Combo,
  type ComboOutcome,
} from './stripe-price-catalog';

type UnscopedDb = ReturnType<typeof import('@propertypro/db/unsafe').createUnscopedClient>;

/**
 * Point `stripe_prices` at `priceId`.
 *
 * Upsert on the business key (plan, type, interval) rather than inserting: the
 * row usually already exists, and re-running must REPOINT it — including away
 * from a `price_placeholder_…` id — instead of colliding on the unique index.
 */
export async function upsertPriceRow(
  db: UnscopedDb,
  combo: Combo,
  priceId: string,
): Promise<void> {
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
}

/**
 * Run the catalog against Stripe. Dry-run reports what WOULD happen and writes
 * nothing — neither to Stripe nor to the database.
 */
export async function seedPriceCatalog(options: {
  stripe: Stripe;
  db: UnscopedDb;
  apply: boolean;
  seededBy: string;
}): Promise<ComboOutcome[]> {
  const { stripe, db, apply, seededBy } = options;
  const outcomes: ComboOutcome[] = [];

  for (const combo of allCombos()) {
    if (!apply) {
      const existing = await stripe.prices.list({
        lookup_keys: [combo.lookupKey],
        active: true,
        limit: 1,
      });
      outcomes.push(describeCombo(combo, existing.data[0] ? 'reuse-existing' : 'would-create'));
      continue;
    }

    const { priceId, created } = await ensurePrice(stripe, combo, seededBy);
    await upsertPriceRow(db, combo, priceId);
    outcomes.push(describeCombo(combo, created ? 'created' : 'reused'));
  }

  return outcomes;
}
