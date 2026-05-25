/**
 * Route contract for `POST /api/v1/access-requests/[id]/deny`.
 *
 * Plan A1 drain #40 — admin deny path for access requests. Mirrors drain
 * #39 (`approve`) shape: params-from-`[id]` plus a tiny optional-`reason`
 * body. Sibling drain #41 (`verify`) is the public-OTP counterpart.
 *
 * Authorization is the canonical 4-gate admin chain (enforced inside the
 * handler, NOT by the runner):
 *   requireAuthenticatedUserId
 *   resolveEffectiveCommunityId(req, null)
 *   assertNotDemoGrace
 *   requireCommunityMembership
 *   requirePermission('residents', 'write')
 *
 * `permission: { resource: 'residents', action: 'write' }` matches the
 * runtime `requirePermission` call. `residents` IS in `RBAC_RESOURCES`
 * (non-placeholder).
 *
 * Response modeling: tight `z.object({ success: z.literal(true) })` per
 * drain #22 precedent. `denyAccessRequest` returns `void`; the handler
 * returns the `{ success: true as const }` literal. No `Date` fields, no
 * index signatures — safe to model tight. The runner wraps as
 * `{ data: { success: true } }` on the wire, byte-identical to the
 * pre-migration envelope.
 *
 * Behavior change vs. pre-migration: invalid `params.id` (non-numeric) and
 * body validation failures now return the runner's canonical
 * `VALIDATION_ERROR` envelope. Status code (400) is unchanged. Pre-migration
 * threw `ValidationError('Validation failed')` / `ValidationError('Invalid
 * request ID')` with the legacy hand-constructed envelope; the message text
 * is no longer guaranteed by the runner.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const accessRequestsDenyContract = defineRoute({
  method: 'POST',
  path: '/api/v1/access-requests/[id]/deny',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      reason: z.string().max(500).optional(),
    }),
  },
  response: z.object({ success: z.literal(true) }),
  permission: { resource: 'residents', action: 'write' },
});
