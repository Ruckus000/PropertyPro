/**
 * POST /api/admin/communities/[id]/billing/change-plan
 *
 * Moves the subscription onto another plan's price at the SAME billing cadence,
 * invoicing the proration immediately (`always_invoice`). This charges the
 * customer's card now — it is the most expensive of the five.
 *
 * Gates, audit and the `confirm: true` requirement are single-sourced in
 * `billingActionRoute`; the mode assertion and the idempotency key are in
 * `changePlan`.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only, via `billingActionRoute`.
 */
import { z } from 'zod';

import { billingActionRoute, confirmedActionSchema } from '@/lib/api/billing-action-route';
import { changePlan } from '@/lib/server/billing-actions';

/**
 * `planId` is a bounded string, not a `z.enum` of the plan ids.
 *
 * `stripe_prices` is the authority on which (plan, community type, cadence)
 * triples exist, and it is a mutable config table — a hard-coded enum here would
 * reject a plan the moment ops added one, and "that plan is not configured" is
 * already a specific, operator-facing 500 from `resolvePriceId`. The bound exists
 * so an absurd value never reaches a query.
 */
const schema = confirmedActionSchema({
  planId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'planId must be a lowercase plan identifier.'),
});

export const POST = billingActionRoute({
  schema,
  auditAction: 'subscription_plan_changed',
  run: (communityId, input) => changePlan(communityId, { planId: input.planId }),
});
