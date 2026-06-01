/**
 * Route contract for `POST /api/v1/stripe/connect/complete`.
 *
 * Plan A1 drain #167. Exchanges Stripe OAuth code for connected account ID.
 * Mirrors drain #164 onboard auth chain; uses body `communityId` directly
 * (not `parseCommunityIdFromBody`).
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → validateConnectOAuthState(state, communityId, userId)
 *     → requireCommunityMembership
 *     → requireFinanceEnabled
 *     → requireFinanceWritePermission
 *     → requireFinanceAdminWrite
 *     → requireActiveSubscriptionForMutation
 *     → completeConnectOnboarding(...)
 *
 * Sub-threshold ordering: invalid body now 400 before 401 (runner parses body
 * before handler auth), matching drain #164 onboard precedent.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const stripeConnectCompletePostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/stripe/connect/complete',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      code: z.string().min(1).max(256),
      state: z.string().min(1).max(2048),
    }),
  },
  response: z.object({
    stripeAccountId: z.string(),
    chargesEnabled: z.boolean(),
    payoutsEnabled: z.boolean(),
  }),
  permission: { resource: 'finances', action: 'write' },
});
