/**
 * Route contract for `POST /api/v1/stripe/connect/complete`.
 *
 * Called by the `/settings/payments/connected` page when Stripe's hosted
 * onboarding sends the admin back. It re-reads the community's saved connected
 * account from Stripe and saves its flags. The body carries only the
 * community: the account id comes from our own table, never from the URL
 * Stripe redirected to, so there is nothing in the request to forge.
 *
 * Tenant scope: `tenantScope: { in: 'body' }`. The return URL is the fixed
 * `NEXT_PUBLIC_APP_URL` (no tenant subdomain), so the legitimate call arrives
 * with no `x-community-id` header and the body value is used. When the header
 * is present it is authoritative, and a mismatch is a 404.
 *
 * Auth chain:
 *   requireAuthenticatedUserId
 *     → requireCommunityMembership
 *     → requireFinanceEnabled
 *     → requirePaymentsEnabled
 *     → requireFinanceWritePermission
 *     → requireFinanceAdminWrite
 *     → requireActiveSubscriptionForMutation
 *     → completeConnectOnboarding(...)
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const stripeConnectCompletePostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/stripe/connect/complete',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.object({
    stripeAccountId: z.string(),
    onboardingComplete: z.boolean(),
    chargesEnabled: z.boolean(),
    payoutsEnabled: z.boolean(),
  }),
  permission: { resource: 'finances', action: 'write' },
  tenantScope: { in: 'body' },
});
