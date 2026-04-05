#!/usr/bin/env tsx
/**
 * Seeds four volume-discount Stripe Coupons. Idempotent.
 * Run with: pnpm tsx scripts/seed-volume-coupons.ts
 */
import Stripe from 'stripe';

const VOLUME_COUPONS = [
  { id: 'volume_10pct', percent_off: 10 },
  { id: 'volume_15pct', percent_off: 15 },
  { id: 'volume_20pct', percent_off: 20 },
] as const;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });

  for (const config of VOLUME_COUPONS) {
    try {
      const existing = await stripe.coupons.retrieve(config.id);
      console.log(`✓ Coupon ${config.id} already exists (${existing.percent_off}% off)`);
    } catch (err: unknown) {
      if (err instanceof Stripe.errors.StripeError && err.code === 'resource_missing') {
        const created = await stripe.coupons.create({
          id: config.id,
          percent_off: config.percent_off,
          duration: 'forever',
          name: `Volume Discount ${config.percent_off}%`,
          metadata: { origin: 'volume_discount' },
        });
        console.log(`+ Created coupon ${created.id} (${created.percent_off}% off)`);
      } else {
        throw err;
      }
    }
  }
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
