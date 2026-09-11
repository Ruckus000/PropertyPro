/**
 * POST /api/admin/communities/[id]/billing/apply-coupon
 *
 * Attaches a Stripe coupon to the subscription, reducing what the customer is
 * charged from the next invoice on. `applyCoupon` retrieves the coupon first, so
 * an unknown code is a 400 that changes nothing rather than a write that replaces
 * the subscription's existing discount with an empty set.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only, via `billingActionRoute`.
 */
import { z } from 'zod';

import { billingActionRoute, confirmedActionSchema } from '@/lib/api/billing-action-route';
import { applyCoupon } from '@/lib/server/billing-actions';

/**
 * The shape of a Stripe coupon id, bounded.
 *
 * Stripe coupon ids are caller-chosen and may be mixed case with `-`/`_` (ours
 * are created by `scripts/seed-volume-coupons.ts`). The character class exists
 * because this value is interpolated into an IDEMPOTENCY KEY — a key carrying a
 * newline or a 500-character string is a different kind of failure from an
 * unknown coupon, and it would happen inside the Stripe call rather than here.
 */
const schema = confirmedActionSchema({
  coupon: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, 'coupon must be a Stripe coupon id.'),
});

export const POST = billingActionRoute({
  schema,
  auditAction: 'subscription_coupon_applied',
  run: (communityId, input) => applyCoupon(communityId, { coupon: input.coupon }),
});
