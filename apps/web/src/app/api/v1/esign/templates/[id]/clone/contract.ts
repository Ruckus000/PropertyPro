/**
 * Route contract for `POST /api/v1/esign/templates/[id]/clone`.
 *
 * Plan A1 drain #79. Clones an e-sign template within the resolved community.
 * Mirrors drain #72 (esign/submissions/[id]/cancel) auth chain but with a
 * REQUIRED body (no query fallback for `communityId`) and a template-object
 * response.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace                 (ASYNC — awaited)
 *     → requireCommunityMembership         (ASYNC — awaited)
 *     → requireEsignWritePermission        (ASYNC — awaited)
 *     → requirePlanFeature(communityId, 'hasEsign')  (ASYNC — awaited)
 *     → cloneTemplate(communityId, actorUserId, params.id, body.name, x-request-id)
 *
 * Service arg order: `(communityId, actorUserId, id, name, requestId)` —
 * actorUserId is the SECOND positional arg. `x-request-id` header forwarded
 * verbatim, including the `null` value when the header is absent.
 *
 * Response is **loose `z.unknown()`** — `cloneTemplate` returns a freshly
 * inserted template row whose shape includes Date fields (e.g. `createdAt`).
 * Tight modeling would `safeParse`-fail on the unserialized Date instances
 * before `NextResponse.json` serializes them (drain #9/#14/#20 precedent).
 * Wire shape stays byte-identical at `{ data: T }`.
 *
 * `permission: { resource: 'esign', action: 'write' }` matches the runtime
 * `requirePermission(membership, 'esign', 'write')` call inside
 * `requireEsignWritePermission`. `esign` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts:51`).
 *
 * Behavior changes vs. pre-migration:
 *   - 400 envelope for invalid `[id]` (was `BadRequestError('Invalid ID')`)
 *     and for malformed body (was `ValidationError('Invalid clone payload')`)
 *     shifts to the canonical `VALIDATION_ERROR` envelope. Status unchanged.
 *   - Success wire shape `{ data: T }` unchanged.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const esignTemplateCloneContract = defineRoute({
  method: 'POST',
  path: '/api/v1/esign/templates/[id]/clone',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      name: z.string().trim().min(1).max(200),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'esign', action: 'write' },
});
