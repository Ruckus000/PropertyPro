/**
 * Route contract for `GET /api/v1/payments/history`.
 *
 * Plan A1 drain #25. Closest precedents:
 *   - drain #18 (`communities/[id]/cancel-preview`, PR #427) — conditional
 *     auth branch + loose `z.unknown()` response.
 *   - drain #21 (`billing-groups/[id]/preview`, PR #429) — same loose
 *     response posture and `z.coerce.number().int().positive()` query
 *     numerics.
 *   - drain #3 (`ledger/balance/[unitId]`) — the resident-owner vs.
 *     staff conditional finance branch this route also implements (without
 *     the owner-balance-only restriction, but with the same multi-unit
 *     `unitId` resolution logic).
 *
 * Query:
 *   - `communityId`: positive int (coerced from string). Reconciled with
 *     the `x-community-id` header inside the handler via
 *     `resolveEffectiveCommunityId` (canonical pattern; 404 on mismatch,
 *     formerly 400 via `parseCommunityIdFromQuery`).
 *   - `unitId`: optional positive int (coerced). The Zod schema replaces
 *     the previous `parsePositiveInt(rawUnitId, 'unitId')` helper which
 *     threw `BadRequestError('unitId must be a positive integer')`. The
 *     wire envelope for malformed `unitId` therefore shifts from
 *     `BAD_REQUEST` to the runner's canonical `VALIDATION_ERROR` at the
 *     same 400 status.
 *
 * Conditional auth branch (preserved verbatim in the route handler — this
 * is the most complex part of the migration; do not refactor):
 *   - `membership.role === 'resident' && membership.isUnitOwner`:
 *     1. `listActorUnitIdsForFinance(communityId, actorUserId)` lookup.
 *     2. Zero units → `ForbiddenError('No unit association found for this owner')`.
 *     3. Multi-unit + no `unitId` → `BadRequestError('unitId query parameter is required when you are associated with multiple units')`.
 *     4. Single-unit + no `unitId` → auto-pick the only unit.
 *     5. Explicit `unitId` not owned → `ForbiddenError('Owners can only access payment history for their own unit')`.
 *   - All other roles → `requireFinanceReadPermission(membership)` +
 *     pass-through `unitId` (optional filter).
 *
 * Business-rule error messages preserved BYTE-IDENTICAL:
 *   - 'No unit association found for this owner' (ForbiddenError)
 *   - 'unitId query parameter is required when you are associated with multiple units' (BadRequestError)
 *   - 'Owners can only access payment history for their own unit' (ForbiddenError)
 *
 * Response modeling: LOOSE `z.unknown()` per drains #14/#18/#21 precedent.
 * `listPaymentHistoryForCommunity` returns payment rows with Date fields
 * (`paidAt`, `createdAt`, etc.) which would `safeParse`-fail under tight
 * modeling because the runner validates before `NextResponse.json`
 * serializes Dates to ISO strings. The wire shape `{ data: history }` is
 * byte-identical to the pre-migration response (the runner re-wraps the
 * raw handler return in `{ data: ... }`).
 *
 * `permission: { resource: 'finances', action: 'read' }` is the canonical
 * RBAC coordinate; `finances` is in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts:41/75/314`). Runtime enforcement of
 * the finance gate lives in `requireFinanceReadPermission` inside the
 * non-resident branch of the handler; the contract metadata documents the
 * RBAC coordinate.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const paymentsHistoryGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/payments/history',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      unitId: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'finances', action: 'read' },
});
