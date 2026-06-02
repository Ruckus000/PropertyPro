/**
 * Route contract for `POST /api/v1/stripe/connect/onboard`.
 *
 * Plan A1 drain #164. Starts Stripe Connect onboarding for a community.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromBody(req, body.communityId)
 *     → requireCommunityMembership
 *     → requireFinanceEnabled
 *     → requireFinanceWritePermission
 *     → requireFinanceAdminWrite
 *     → requireActiveSubscriptionForMutation
 *     → startConnectOnboarding(communityId, actorUserId, requestId)
 *
 * `parseCommunityIdFromBody` is preserved from pre-migration (finance
 * mutation routes use the same helper as drain #128 assessments).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const stripeConnectOnboardPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/stripe/connect/onboard',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.object({
    onboardingUrl: z.string(),
  }),
  permission: { resource: 'finances', action: 'write' },
});
