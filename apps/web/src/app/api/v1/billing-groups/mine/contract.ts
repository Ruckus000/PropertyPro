/**
 * Route contract for `GET /api/v1/billing-groups/mine`.
 *
 * Plan A1 drain #6 — mirrors drain #1's (`/api/v1/me/communities`) no-input
 * session-anchored shape. The actor IS the anchor; no `communityId` is
 * required. The payload differs from drain #1 only in that it's a single
 * object (`{ billingGroupId }`) rather than an array.
 *
 * Lives in its own file so consumers (`useBillingGroup`) could
 * `import type` from here without dragging Next.js or the service module
 * into the client bundle. (Today the hook keeps its hand-written
 * `BillingGroupResponse` interface because the route's error-message
 * surfacing is a documented exception to the `requestJson` rule — see the
 * docblock in `apps/web/src/hooks/use-billing-group.ts`. The contract still
 * locks the wire shape on the server side.)
 *
 * Authorization: session-anchored, no community context. The "PM in at
 * least one community" gate (`isPmAdminInAnyCommunity`) is enforced inside
 * the route handler in `./route.ts` — the contract is metadata only and
 * does not gate the call.
 *
 * NOTE: `permission: { resource: 'settings', action: 'read' }` is a
 * placeholder — `RBAC_RESOURCES` doesn't have a "billing-groups" or
 * "billing" resource, and this endpoint isn't gated by the RBAC matrix
 * anyway (the PM gate is the authoritative check). Any value-typed field
 * from `RBAC_RESOURCES` satisfies the contract's structural typing;
 * `settings` is the closest semantic match and matches the precedent set
 * by drain #1. The contract runner does not enforce `permission` today
 * (Plan A1 foundation; metadata only).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const billingGroupMineSchema = z.object({
  billingGroupId: z.number().int().positive(),
});

export type BillingGroupMine = z.infer<typeof billingGroupMineSchema>;

export const billingGroupsMineContract = defineRoute({
  method: 'GET',
  path: '/api/v1/billing-groups/mine',
  request: {},
  response: billingGroupMineSchema,
  permission: { resource: 'settings', action: 'read' },
});
