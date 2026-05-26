/**
 * Route contract for `POST /api/v1/esign/submissions/[id]/cancel`.
 *
 * Plan A1 drain #72. Cancels an in-flight e-sign submission for the resolved
 * community.
 *
 * **Dual `communityId` source — body OR query.** The pre-migration handler
 * accepted `communityId` from EITHER the JSON body OR the query string
 * (`body.communityId !== undefined ? parseCommunityIdFromBody(...) :
 * parseCommunityIdFromQuery(req)`). Both `parseCommunityIdFromBody` and
 * `parseCommunityIdFromQuery` ultimately delegate to
 * `resolveEffectiveCommunityId(req, candidate)`, so we preserve the dual
 * source by declaring `communityId` as **optional** on both `body` and
 * `query`, then combining them in the handler with
 * `body.communityId ?? query.communityId ?? null` before the single
 * `resolveEffectiveCommunityId` call.
 *
 * **Empty-body tolerance.** Pre-migration used
 * `await req.json().catch(() => ({}))` — i.e., a request that omits the body
 * entirely (or sends an unparseable body) was treated as `{}`. The runner's
 * `parseBody` already catches `req.json()` throws and feeds `undefined` into
 * `safeParse`. To match the same tolerance, the body schema makes
 * `communityId` optional AND the wrapper itself is `.optional()` so a
 * fully-missing body parses to `undefined`. The handler then reads
 * `body?.communityId` defensively.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body?.communityId ?? query.communityId ?? null)
 *     → assertNotDemoGrace                 (ASYNC — awaited)
 *     → requireCommunityMembership         (ASYNC — awaited)
 *     → requireEsignWritePermission        (ASYNC — awaited)
 *     → requirePlanFeature(communityId, 'hasEsign')  (ASYNC — awaited)
 *     → cancelSubmission(communityId, actorUserId, params.id, x-request-id)
 *
 * Service arg order is `(communityId, actorUserId, id, requestId)` —
 * actorUserId is the SECOND positional arg (drain #22/#67 precedent for
 * audit-actor-second service signatures). `x-request-id` header forwarded
 * verbatim, including the `null` value when the header is absent.
 *
 * Response is tight `z.object({ success: z.literal(true) })` — the success
 * shape is fully known (drain #17/#22 precedent for `{ success: true }`
 * literal acks). Wire shape stays byte-identical at
 * `{ data: { success: true } }`.
 *
 * `permission: { resource: 'esign', action: 'write' }` matches the runtime
 * `requirePermission(membership, 'esign', 'write')` call inside
 * `requireEsignWritePermission`. `esign` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts:51`).
 *
 * Behavior changes vs. pre-migration:
 *   - 400 envelope for invalid `[id]` (was `BadRequestError('Invalid ID')`)
 *     and for malformed body (was `ValidationError('Invalid cancel payload')`)
 *     shifts to the canonical `VALIDATION_ERROR` envelope. Status unchanged.
 *   - `parseCommunityIdFromBody` previously raised
 *     `BadRequestError('communityId must be a positive integer')` on a
 *     non-integer body value; this now flows through the same
 *     `VALIDATION_ERROR` envelope. Status unchanged at 400.
 *   - Success wire shape `{ data: { success: true } }` unchanged.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const esignSubmissionCancelContract = defineRoute({
  method: 'POST',
  path: '/api/v1/esign/submissions/[id]/cancel',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive().optional(),
    }),
    body: z
      .object({
        communityId: z.number().int().positive().optional(),
      })
      .optional(),
  },
  response: z.object({ success: z.literal(true) }),
  permission: { resource: 'esign', action: 'write' },
});
