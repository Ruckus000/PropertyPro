/**
 * Route contract for `POST /api/v1/esign/submissions/[id]/remind`.
 *
 * Plan A1 drain #82. Sends a reminder to a pending signer of an e-sign
 * submission. Mirrors drain #79 (esign/templates/[id]/clone) auth chain.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace                 (ASYNC — awaited)
 *     → requireCommunityMembership         (ASYNC — awaited)
 *     → requireEsignWritePermission        (ASYNC — awaited)
 *     → requirePlanFeature(communityId, 'hasEsign')  (ASYNC — awaited)
 *     → sendReminder(communityId, actorUserId, params.id, body.signerId, x-request-id)
 *
 * Service arg order: `(communityId, actorUserId, id, signerId, requestId)` —
 * actorUserId is the SECOND positional arg. `x-request-id` header forwarded
 * verbatim, including the `null` value when the header is absent.
 *
 * Response is **tight `z.object({ success: z.literal(true) })`** — the
 * pre-migration handler returns a fixed `{ success: true }` ack. No Date
 * fields or other unserializable values flow through; tight modeling is
 * safe and provides a stronger wire contract.
 *
 * `permission: { resource: 'esign', action: 'write' }` matches the runtime
 * `requirePermission(membership, 'esign', 'write')` call inside
 * `requireEsignWritePermission`. `esign` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts:51`).
 *
 * Behavior changes vs. pre-migration:
 *   - 400 envelope for invalid `[id]` (was `BadRequestError('Invalid ID')`)
 *     and for malformed body (was `ValidationError('Invalid remind payload')`)
 *     shifts to the canonical `VALIDATION_ERROR` envelope. Status unchanged.
 *   - Success wire shape `{ data: { success: true } }` unchanged.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const esignSubmissionRemindContract = defineRoute({
  method: 'POST',
  path: '/api/v1/esign/submissions/[id]/remind',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      signerId: z.number().int().positive(),
    }),
  },
  response: z.object({ success: z.literal(true) }),
  permission: { resource: 'esign', action: 'write' },
});
