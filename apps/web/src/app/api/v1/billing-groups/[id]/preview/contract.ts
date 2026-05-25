/**
 * Route contract for `GET /api/v1/billing-groups/[id]/preview`.
 *
 * Plan A1 drain #21. Mirrors drain #18 (`communities/[id]/cancel-preview`)
 * billing-group-ownership auth model, but for ADDING a community to an
 * existing billing group (changeType: 'add') instead of removing one.
 *
 * Path param: `[id]` → billingGroupId, coerced via
 * `z.coerce.number().int().positive()`.
 *
 * Query:
 *   - `planId`: 'essentials' | 'professional' | 'operations_plus'
 *   - `communityType`: 'condo_718' | 'hoa_720' | 'apartment'
 *
 * Authorization (preserved verbatim in the route handler):
 *   1. `requireAuthenticatedUserId()` — Supabase session, 401 on miss.
 *   2. `getBillingGroupByOwner(userId)` — look up the actor's billing group.
 *   3. 403 if no group exists OR the group's `id` doesn't match the path
 *      param (cross-actor access attempt).
 *   4. `listSiblingCommunityPlans(billingGroupId)` (no excludeCommunityId —
 *      this is the ADD path, all current communities are siblings).
 *   5. `calculatePricingImpact({ basePricesUsd: [...existing, newPlanPrice],
 *      currentGroupSize: existing.length, changeType: 'add' })` → return.
 *
 * No `resolveEffectiveCommunityId` reconciliation here — billing-group
 * ownership is the authoritative tenant scope, there is no community
 * context, and no `x-community-id` header is consulted.
 *
 * `permission: { resource: 'billing_groups', action: 'read' }` is the
 * canonical RBAC coordinate; `billing_groups` is NOT in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts`), so the runner does not enforce
 * it today. The actual gate is the billing-group ownership check in the
 * handler. Drain #18 used `communities/read` for the same reason — there
 * is no platform-level RBAC resource for billing-group reads.
 *
 * Response modeling: LOOSE `z.unknown()` per drain #18 precedent. The
 * route returns `PricingImpactResult` from `calculatePricingImpact`. The
 * consumer (`useBillingGroupPreview` in
 * `apps/web/src/hooks/use-add-community.ts:81-108`) declares its own
 * `PricingPreview` TS interface and reads `json.data as PricingPreview`,
 * pinning the wire shape on the client side. Loose modeling avoids
 * coupling the contract to internal billing types (`PricingImpactResult`,
 * `VolumeTier`) and stays robust against additive evolutions of the
 * pricing-preview output.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const billingGroupPreviewContract = defineRoute({
  method: 'GET',
  path: '/api/v1/billing-groups/[id]/preview',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      planId: z.enum(['essentials', 'professional', 'operations_plus']),
      communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'billing_groups', action: 'read' },
});
