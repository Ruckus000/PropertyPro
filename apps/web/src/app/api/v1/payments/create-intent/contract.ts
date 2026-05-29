/**
 * Route contract for `POST /api/v1/payments/create-intent`.
 *
 * Plan A1 drain #125. Creates a Stripe payment intent for an assessment line
 * item or rent obligation.
 *
 * Auth surface (preserved verbatim from pre-migration):
 *   requireAuthenticatedUserId
 *     → parseCommunityIdFromBody (NOT resolveEffectiveCommunityId — finance
 *       routes use header/body reconciliation via parseCommunityIdFromBody)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireFinanceEnabled
 *     → requireActiveSubscriptionForMutation
 *     → role-specific finance gates + unit scoping
 *
 * Body `superRefine` enforces lineItemId XOR payableId at the contract layer
 * (single validation layer — handler does not re-parse).
 *
 * Response: loose `z.unknown()` — intent payload may include provider fields.
 *
 * `permission: { resource: 'finances', action: 'write' }` is metadata only.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const createIntentBodySchema = z.object({
  communityId: z.number().int().positive(),
  lineItemId: z.number().int().positive().optional(),
  payableId: z.number().int().positive().optional(),
  payableType: z.enum(['assessment_line_item', 'rent_obligation']).optional(),
  unitId: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (!value.lineItemId && !value.payableId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payableId'],
      message: 'Either lineItemId or payableId is required',
    });
  }
});

export const createPaymentIntentContract = defineRoute({
  method: 'POST',
  path: '/api/v1/payments/create-intent',
  request: {
    body: createIntentBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'write' },
});
