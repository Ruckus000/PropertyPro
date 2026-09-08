#!/usr/bin/env tsx
/**
 * Seeds the three volume-discount Stripe Coupons. Idempotent.
 *
 * Coupon IDS are fixed strings, but coupon OBJECTS are per-mode: the ids below
 * exist separately in the test and live accounts, and a live key cannot see a
 * test coupon. So this has to be re-run against the live account at cutover.
 *
 * Deliberately NOT mode-guarded, unlike its cutover siblings: it is legitimately
 * run in BOTH modes (test for local/e2e, live at cutover) and creating a coupon
 * in the wrong account is cheap and inert. But writing to the wrong account
 * SILENTLY is not acceptable, so it announces the mode it is about to act in —
 * the failure this catches is `scripts/with-env-local.sh` substituting
 * .env.local's test key for a live one exported on the command line.
 *
 * Run with: pnpm tsx scripts/seed-volume-coupons.ts
 */
import Stripe from 'stripe';
import { describeLivemode, redactStripeKey, stripeKeyLivemode } from '@propertypro/shared';

const VOLUME_COUPONS = [
  { id: 'volume_10pct', percent_off: 10 },
  { id: 'volume_15pct', percent_off: 15 },
  { id: 'volume_20pct', percent_off: 20 },
] as const;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');

  // Say the mode out loud BEFORE writing. `describeLivemode(null)` names an
  // unrecognised prefix rather than guessing.
  const livemode = stripeKeyLivemode(key);
  console.log(
    `Volume coupons — key ${redactStripeKey(key)} (${describeLivemode(livemode)} mode).\n` +
      'Coupons are per-mode: this creates them in THAT account and nowhere else.',
  );

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
