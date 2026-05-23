/**
 * Route contract for `GET /api/v1/communities/[id]/cancel-preview`.
 *
 * Plan A1 drain #18 — params-only GET. Mirrors drain #11 (`polls/[id]/my-vote`)
 * path-param shape but with NO query input (`[id]` is the only request input)
 * and a billing-group ownership auth chain instead of polls feature/RBAC gates.
 *
 * Path param: `[id]` → community id, coerced via
 * `z.coerce.number().int().positive()`.
 *
 * Authorization (preserved verbatim in the route handler):
 *   1. `requireAuthenticatedUserId()` — Supabase session.
 *   2. `getCommunityForCancelPreview(communityId)` → 404 if missing/deleted.
 *   3. If `target.billingGroupId === null` → early return no-op shape.
 *   4. `getBillingGroupOwner(billingGroupId)` → 403 unless ownerUserId === actor.
 *   5. `listSiblingCommunityPlans` → `calculatePricingImpact` → return.
 *
 * `permission: { resource: 'communities', action: 'read' }` is the canonical
 * RBAC coordinate; the runner does NOT enforce it today and the actual gate
 * is the billing-group ownership check in the handler. The `communities`
 * resource itself is not a tenant-scoped RBAC matrix entry — this is a
 * platform-level read of the global communities table.
 *
 * Response modeling: LOOSE `z.unknown()`. Two reasons documented for future
 * auditors:
 *   1. Two response branches exist (early-return manual no-op object vs.
 *      `PricingImpactResult` returned by `calculatePricingImpact`). Tight
 *      modeling would have to union both branches anyway.
 *   2. The consumer hook (`useCancelPreview` in
 *      `apps/web/src/hooks/use-cancel-community.ts:9`) declares its own
 *      `CancelPreview` TS interface and reads `json.data as CancelPreview`,
 *      pinning the wire shape on the client side. Loose modeling avoids
 *      coupling the route contract to internal billing types
 *      (`PricingImpactResult`, `VolumeTier`) and stays robust against
 *      additive evolutions of the pricing-preview output.
 * This matches drain #14 (`polls/[id]/results`) loose-modeling precedent.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const cancelPreviewContract = defineRoute({
  method: 'GET',
  path: '/api/v1/communities/[id]/cancel-preview',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'communities', action: 'read' },
});
