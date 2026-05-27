/**
 * Route contract for `POST /api/v1/admin/join-requests/[id]/deny`.
 *
 * Plan A1 drain #83. Admin action: deny a pending community join request for
 * the resolved community. Does NOT create a user_roles row; denial notes are
 * stored and surfaced to the requester. Emits a `join_request.denied` audit
 * event.
 *
 * Mirrors drain #81 (approve sibling) exactly — the only differences are the
 * service call (`denyJoinRequest` vs `approveJoinRequest`) and the audit
 * action string (`join_request.denied` vs `join_request.approved`).
 *
 * **Header-only communityId resolution.** The pre-migration handler resolves
 * the community ID purely from the `x-community-id` header via
 * `resolveEffectiveCommunityId(req, null)` — there is NO `body.communityId`
 * field. The contract therefore declares no `communityId` on the body, and
 * the handler continues to call `resolveEffectiveCommunityId(req, null)`.
 *
 * **Empty-body tolerance.** Pre-migration used
 * `await req.json().catch(() => ({}))` — a request omitting the body entirely
 * (or sending unparseable JSON) was treated as `{}`. The runner's `parseBody`
 * already catches `req.json()` throws and feeds `undefined` into `safeParse`,
 * so we make the body wrapper `.optional()` and the inner `notes` field
 * `.optional()`. The handler reads `body?.notes` defensively. This mirrors
 * the drain #72 esign/cancel empty-body pattern (and drain #81 sibling).
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, null)              // header-only
 *     → requireCommunityMembership                          (ASYNC — awaited)
 *     → requirePermission(membership, 'residents', 'write')
 *     → getJoinRequestCommunityId(params.id)                // returns null | number
 *     → 404 NotFoundError('Join request not found')         when null
 *     → 403 ForbiddenError('Request belongs to a different community')
 *                                                            when mismatched
 *     → denyJoinRequest({ requestId, reviewerUserId, notes })
 *     → logAuditEvent({ action: 'join_request.denied', ... })
 *
 * No `assertNotDemoGrace`, no `requireActiveSubscriptionForMutation` — the
 * pre-migration handler invokes neither, and the migration preserves that
 * absence verbatim.
 *
 * Audit log preserved post-service-call (mirrors drain #73 faqs/reorder and
 * drain #81 approve sibling). Metadata `{ notes: body?.notes ?? null }`
 * keeps the byte-identical persisted shape — `undefined` collapses to `null`.
 *
 * Response is loosely modeled as `z.unknown()` because `denyJoinRequest`
 * returns a service object whose fields may include Date or other
 * non-`safeParse`-friendly values (drain #9/#14/#18/#20/#81 precedent).
 *
 * `permission: { resource: 'residents', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'residents', 'write')` call.
 * `residents` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior changes vs. pre-migration:
 *   - 400 envelope for invalid `[id]` shifts from
 *     `ValidationError('Invalid request ID')` to the canonical
 *     `VALIDATION_ERROR` envelope. Status unchanged at 400.
 *   - 400 envelope for malformed body (e.g., `notes` too long) shifts from
 *     `ValidationError('Invalid body')` to canonical `VALIDATION_ERROR`.
 *     Status unchanged at 400.
 *   - Success wire shape `{ data: <result> }` unchanged — pre-migration
 *     already returned `NextResponse.json({ data: result })`, and the runner
 *     wraps the handler return into the same canonical envelope.
 *   - 404/403 business-rule errors (`Join request not found` / `Request
 *     belongs to a different community`) preserved byte-identical via the
 *     standard `NotFoundError` / `ForbiddenError` envelopes.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const adminJoinRequestDenyContract = defineRoute({
  method: 'POST',
  path: '/api/v1/admin/join-requests/[id]/deny',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z
      .object({
        notes: z.string().max(500).optional(),
      })
      .optional(),
  },
  response: z.unknown(),
  permission: { resource: 'residents', action: 'write' },
});
