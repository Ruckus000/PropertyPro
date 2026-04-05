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
 *
 * Stripe pagination: auto-pages via the SDK's async iterator so portfolios
 * with >100 active subscriptions are handled correctly.
 */
export async function applyVolumeDiscountToSubscriptions(
  stripeCustomerId: string,
  newTier: VolumeTier,
): Promise<void> {
  const stripe = getStripe();
  const newCouponId = tierToCouponId(newTier);

  const subsList = stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    limit: 100,
  });

  for await (const sub of subsList) {
    const existingVolume = findVolumeDiscount(sub.discounts);

    // Rebuild the discounts array ourselves: keep every non-volume coupon
    // that was already on the subscription, then append the new volume
    // coupon if one applies to this tier. This prevents Stripe's update
    // call from wiping out promos or manually-applied coupons.
    const preservedCoupons = collectNonVolumeCoupons(sub.discounts);
    const nextDiscounts: Array<{ coupon: string }> = preservedCoupons.map((c) => ({ coupon: c }));
    if (newCouponId) nextDiscounts.push({ coupon: newCouponId });

    if (existingVolume) {
      await stripe.subscriptions.deleteDiscount(sub.id, existingVolume.id);
    }

    await stripe.subscriptions.update(sub.id, {
      discounts: nextDiscounts,
    });
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

/** Return the coupon IDs of every discount that is NOT a volume-origin coupon. */
function collectNonVolumeCoupons(
  discounts: Array<DiscountLike | string> | undefined | null,
): string[] {
  if (!discounts) return [];
  const out: string[] = [];
  for (const d of discounts) {
    if (typeof d === 'string') continue;
    const couponId = d.coupon?.id;
    const isVolume = d.coupon?.metadata?.origin === VOLUME_DISCOUNT_ORIGIN;
    if (couponId && !isVolume) out.push(couponId);
  }
  return out;
}
