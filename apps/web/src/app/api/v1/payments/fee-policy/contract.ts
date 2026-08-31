/**
 * Route contracts for `/api/v1/payments/fee-policy`.
 *
 * Plan A1 drain #13. Mirrors drain #4 (community/contact) — two contracts
 * in one file, GET (query) + PATCH (body), with the PATCH side emitting an
 * audit-log event from the route handler.
 *
 * One file, two contracts — exported separately so the GET and PATCH
 * handlers each consume the right shape.
 *
 * Authorization:
 *   GET   — any community member with finance enabled (`requireFinanceEnabled`)
 *   PATCH — admin role + finance write permission (`requireFinanceAdminWrite`),
 *           additionally blocked during the demo grace window
 *           (`assertNotDemoGrace`).
 *
 * `permission: { resource: 'finances', action: 'read' | 'write' }` is a
 * placeholder; the runner doesn't enforce it (A1 metadata only). The route
 * still calls `requireFinanceEnabled` + `requireFinanceAdminWrite` directly.
 * Matches drain #3's `finances/read` placeholder choice (more accurate than
 * `settings`, which earlier drains used).
 *
 * Behavior change vs. pre-migration: header/query (or header/body)
 * `communityId` mismatch now returns 404 via
 * `resolveEffectiveCommunityId`. Pre-migration the route used
 * `parseResult.data.communityId` directly and IGNORED the `x-community-id`
 * header entirely. Aligning with the canonical reconciliation primitive is
 * the same intentional change drains #2 and #3 adopted; security-aligned
 * and no consumer dependency in practice (verified across
 * `use-fee-policy.ts` and `use-payment-portal.ts`, which only read the
 * `data.feePolicy` field and don't construct or send the header).
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Fee policy enum. `getCommunityFeePolicy` returns a non-nullable
 * `PaymentFeePolicy` (`'owner_pays' | 'association_absorbs'`), falling
 * back to `DEFAULT_FEE_POLICY` ('association_absorbs') if the underlying
 * `communitySettings.paymentFeePolicy` is unset. The response schema is
 * therefore non-nullable.
 */
/**
 * READ shape — still both values, because a community may have `owner_pays`
 * stored from before it was retired and the settings UI has to be able to say
 * so. See `getCommunityFeePolicy`.
 */
export const feePolicyEnum = z.enum(['owner_pays', 'association_absorbs']);

/**
 * WRITE shape — `association_absorbs` only (F-16).
 *
 * `owner_pays` passed a card-rate processing fee to the resident, and `'card'`
 * includes debit, which Visa/Mastercard rules prohibit surcharging. The mode is
 * retired rather than repaired; a PATCH that still sends it now gets a 400
 * naming the reason rather than silently writing a setting nothing honours.
 */
export const writableFeePolicyEnum = z.literal('association_absorbs');

export type FeePolicyValue = z.infer<typeof feePolicyEnum>;

export const feePolicyResponseSchema = z.object({
  feePolicy: feePolicyEnum,
});

export type FeePolicyResponse = z.infer<typeof feePolicyResponseSchema>;

export const getFeePolicyContract = defineRoute({
  method: 'GET',
  path: '/api/v1/payments/fee-policy',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: feePolicyResponseSchema,
  permission: { resource: 'finances', action: 'read' },
});

export const patchFeePolicyContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/payments/fee-policy',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      feePolicy: writableFeePolicyEnum,
    }),
  },
  response: feePolicyResponseSchema,
  permission: { resource: 'finances', action: 'write' },
});
