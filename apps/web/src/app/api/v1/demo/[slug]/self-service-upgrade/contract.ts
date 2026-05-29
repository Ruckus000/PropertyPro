/**
 * Route contract for `POST /api/v1/demo/[slug]/self-service-upgrade`.
 *
 * Plan A1 drain #149. Creates a Stripe checkout session for demo-to-paid
 * self-service conversion. Response is B1-canonical `{ data: { checkoutUrl } }`
 * on the wire (handler returns `{ checkoutUrl }`; runner wraps).
 *
 * Auth is Supabase cookie session + demo-user membership check in-handler
 * (not expressible as standard tenant RBAC). Stripe session creation stays
 * in-handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { PLAN_IDS } from '@propertypro/shared';

const paramsSchema = z.object({
  slug: z.string().min(1).max(200),
});

const bodySchema = z.object({
  planId: z.enum(PLAN_IDS),
  customerEmail: z.string().email('Valid email is required'),
  customerName: z.string().min(1, 'Customer name is required').max(200),
});

export const demoSelfServiceUpgradePostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/demo/[slug]/self-service-upgrade',
  request: {
    params: paramsSchema,
    body: bodySchema,
  },
  response: z.object({
    checkoutUrl: z.string().url().nullable(),
  }),
});
