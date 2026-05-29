/**
 * Route contract for `POST /api/v1/billing/upgrade-requests`.
 *
 * Plan A1 drain #146. Non-billing members notify billing-capable users of a
 * plan upgrade request (in-app notifications only).
 *
 * Tenant: `resolveEffectiveCommunityId(req, null)` — communityId is NOT in
 * the request body. `canRequestUpgrade` role gate stays in-handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { PLAN_FEATURES, type PlanId } from '@propertypro/shared';

const PLAN_ID_VALUES = Object.keys(PLAN_FEATURES) as PlanId[];

const bodySchema = z.object({
  featureKey: z.string().min(1).max(64).nullable().optional(),
  requestedPlan: z.enum(PLAN_ID_VALUES as [PlanId, ...PlanId[]]).nullable().optional(),
});

export const billingUpgradeRequestPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/billing/upgrade-requests',
  request: {
    body: bodySchema,
  },
  response: z.object({
    ok: z.literal(true),
    notified: z.number().int().nonnegative(),
  }),
});
