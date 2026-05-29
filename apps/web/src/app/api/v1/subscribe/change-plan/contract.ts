/**
 * Route contract for `POST /api/v1/subscribe/change-plan`.
 *
 * Plan A1 drain #148. In-app plan switch for an existing paid subscriber
 * (Stripe subscription update + conversion event).
 *
 * Tenant: `resolveEffectiveCommunityId(req, null)` — communityId is NOT in
 * the body. Reauth + settings write permission gates stay in-handler.
 *
 * Bespoke error codes preserved via `AppError`: `NO_ACTIVE_SUBSCRIPTION`,
 * `DOWNGRADE_NOT_SUPPORTED`, `NO_OP_PLAN_CHANGE`, `STRIPE_UPDATE_FAILED`.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { PLAN_IDS } from '@propertypro/shared';

const bodySchema = z.object({
  planId: z.enum(PLAN_IDS),
  billingInterval: z.enum(['month', 'year']),
});

export const subscribeChangePlanPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/subscribe/change-plan',
  request: {
    body: bodySchema,
  },
  response: z.object({
    ok: z.literal(true),
    planId: z.enum(PLAN_IDS),
    billingInterval: z.enum(['month', 'year']),
  }),
  permission: { resource: 'settings', action: 'write' },
});
