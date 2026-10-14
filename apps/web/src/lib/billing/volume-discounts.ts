import Stripe from 'stripe';
import { tierToCouponId, type VolumeTier } from './tier-calculator';

const VOLUME_COUPON_IDS = new Set(
  (['tier_10', 'tier_15', 'tier_20'] as const).map((tier) => tierToCouponId(tier)),
);

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { apiVersion: '2026-01-28.clover' });
}

/**
 * Applies the target volume discount tier to every active subscription
 * on the given Stripe customer, replacing any previous volume coupon and
 * keeping every other discount (promos, admin-applied coupons) as it is.
 *
 * `discounts` on update REPLACES the subscription's list, so the list is
 * rebuilt from the live one. Two Stripe facts this depends on:
 * - `subscriptions.list` returns discounts as `di_…` ids unless expanded;
 * - an expanded Discount carries its coupon at `source.coupon` (no top-level
 *   `coupon` in this API version).
 * Missing either made every kept discount invisible, so every update wiped
 * the group's other coupons. Existing discounts are reused by id, which keeps
 * a repeating coupon's elapsed duration.
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
    expand: ['data.discounts'],
  });

  for await (const sub of subsList) {
    const next: Array<{ discount: string } | { coupon: string }> = [];
    let hasNewCoupon = false;
    for (const d of sub.discounts) {
      if (typeof d === 'string') {
        // Unexpanded: we cannot tell volume from non-volume, so writing would
        // either drop a coupon or stack two volume tiers.
        throw new Error(`Subscription ${sub.id} discounts were not expanded`);
      }
      const couponId = couponIdOf(d);
      if (couponId === newCouponId) hasNewCoupon = true;
      if (!VOLUME_COUPON_IDS.has(couponId) || couponId === newCouponId) next.push({ discount: d.id });
    }
    if (newCouponId && !hasNewCoupon) next.push({ coupon: newCouponId });

    await stripe.subscriptions.update(sub.id, { discounts: next });
  }
}

function couponIdOf(discount: Stripe.Discount): string | null {
  const coupon = discount.source?.coupon;
  if (typeof coupon === 'string') return coupon;
  return coupon?.id ?? null;
}
