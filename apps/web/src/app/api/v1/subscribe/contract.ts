/**
 * Route contract for `POST /api/v1/subscribe`.
 *
 * Plan A1 drain #156. Creates a Stripe Checkout session for first-time
 * community subscription. B1 canonical envelope: handler returns
 * `{ checkoutUrl }`; runner wraps to `{ data: { checkoutUrl } }`.
 *
 * Tenant: `resolveEffectiveCommunityId(req, null)` — communityId is NOT in
 * the body (header/query tenant resolution).
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { PLAN_IDS } from '@propertypro/shared';

export const subscribePostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/subscribe',
  request: {
    body: z.object({
      planId: z.enum(PLAN_IDS),
    }),
  },
  response: z.object({
    checkoutUrl: z.string().url().nullable(),
  }),
  permission: { resource: 'settings', action: 'write' },
});
