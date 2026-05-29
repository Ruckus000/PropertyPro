/**
 * Route contract for `PATCH /api/v1/payments/update-intent`.
 *
 * Plan A1 drain #131. Updates Stripe payment-intent fee metadata.
 *
 * Auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromBody (finance header/body reconciliation)
 *     → requireCommunityMembership
 *     → requireFinanceEnabled
 *     → requireFinanceWritePermission
 *     → owner PI ownership OR requireFinanceAdminWrite
 *
 * Response: loose `z.unknown()` — Stripe/provider fields may evolve.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const updateIntentBodySchema = z.object({
  communityId: z.number().int().positive(),
  paymentIntentId: z.string().startsWith('pi_'),
  paymentMethod: z.enum(['card', 'us_bank_account']),
});

export const updatePaymentIntentContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/payments/update-intent',
  request: {
    body: updateIntentBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'write' },
});
