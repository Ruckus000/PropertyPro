import Stripe from 'stripe';
import { tierToCouponId, type VolumeTier } from './tier-calculator';

const VOLUME_DISCOUNT_ORIGIN = 'volume_discount';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { apiVersion: '2026-01-28.clover' });
}

/**
 * Applies the target volume discount tier to every active subscription
 * on the given Stripe customer. Removes any existing volume discount
 * (identified by metadata.origin='volume_discount') before applying
 * the new one. Non-volume discounts (promos, etc.) are left untouched.
 */
export async function applyVolumeDiscountToSubscriptions(
  stripeCustomerId: string,
  newTier: VolumeTier,
): Promise<void> {
  const stripe = getStripe();
  const newCouponId = tierToCouponId(newTier);

  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    limit: 100,
  });

  for (const sub of subs.data) {
    const existingVolume = findVolumeDiscount(sub.discounts);

    if (existingVolume) {
      await stripe.subscriptions.deleteDiscount(sub.id, existingVolume.id);
    }

    if (newCouponId) {
      await stripe.subscriptions.update(sub.id, {
        discounts: [{ coupon: newCouponId }],
      });
    }
  }
}

interface DiscountLike {
  id: string;
  coupon?: { id: string; metadata?: Record<string, string> } | null;
}

function findVolumeDiscount(
  discounts: Array<DiscountLike | string> | undefined | null,
): DiscountLike | null {
  if (!discounts) return null;
  for (const d of discounts) {
    if (typeof d === 'string') continue;
    if (d.coupon?.metadata?.origin === VOLUME_DISCOUNT_ORIGIN) {
      return d;
    }
  }
  return null;
}
