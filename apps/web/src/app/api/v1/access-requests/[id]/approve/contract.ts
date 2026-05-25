/**
 * Contract for POST /api/v1/access-requests/[id]/approve.
 *
 * Plan A1 drain #39. Admin endpoint to approve a pending access request.
 *
 * Auth chain (unchanged from pre-migration, enforced inside the handler):
 *   requireAuthenticatedUserId → resolveEffectiveCommunityId(req, null)
 *   → assertNotDemoGrace → requireCommunityMembership
 *   → requirePermission('residents', 'write') → approveAccessRequest.
 *
 * `resolveEffectiveCommunityId(req, null)` reads ONLY the `x-community-id`
 * header — this route takes no `?communityId=` query param. The contract
 * intentionally declares no `query` schema to match that semantic.
 *
 * Body schema matches the pre-migration `approveSchema` byte-for-byte:
 * `{ unitId?: number }` (positive int when present).
 *
 * Response modeling: loose `z.unknown()`. `approveAccessRequest` returns
 * `{ userId: string }` today, but a tight schema would break forward-compat
 * if the service later adds fields, and matches the loose convention used
 * by sibling POST drains (#16, #19) for service-passthrough returns.
 *
 * `permission: { resource: 'residents', action: 'write' }` mirrors the
 * inline `requirePermission(membership, 'residents', 'write')` call. The
 * runner does not enforce this field — the inline call is the source of
 * truth — but the metadata documents the gate for tooling.
 *
 * Behavior change vs. pre-migration:
 *   - Invalid `params.id` (non-numeric, zero, negative) and invalid `body`
 *     (e.g., `unitId: 0`) now return the runner's canonical
 *     `VALIDATION_ERROR` envelope instead of `ValidationError('Invalid
 *     request ID')` / `ValidationError('Validation failed')`. Status code
 *     400 unchanged. Hooks read `!res.ok` opaquely (`use-access-requests`
 *     family), so the envelope shape change is invisible to callers.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const accessRequestsApproveContract = defineRoute({
  method: 'POST',
  path: '/api/v1/access-requests/[id]/approve',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      unitId: z.number().int().positive().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'residents', action: 'write' },
});
