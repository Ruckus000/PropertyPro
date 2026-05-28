/**
 * Route contract for `POST /api/v1/visitors/[id]/revoke`.
 *
 * Plan A1 drain #93. Single-method POST that revokes a visitor pass.
 * Auth chain (preserved verbatim from the pre-migration handler):
 *
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace(communityId)
 *     → requireCommunityMembership(communityId, actorUserId)
 *     → requireVisitorLoggingEnabled(membership)   // ASYNC — must be `await`ed
 *     → requireVisitorsWritePermission(membership) // sync
 *     → THREE-WAY authorization branch on membership.role / isAdmin:
 *         · Admin path (membership.isAdmin === true): requires `reason` in body;
 *           throws ValidationError('Reason is required for staff revocations')
 *           if `reason` is missing/empty.
 *         · Resident path (isResidentRole(role) === true): requires
 *           `await isResidentVisitorRevokeEnabled(communityId)` to be true
 *           (else ForbiddenError('Resident visitor pass revocation is not
 *           enabled for this community')) AND
 *           `await getVisitorHostUserId(communityId, visitorId)` to match the
 *           actor (else ForbiddenError('You can only revoke passes you
 *           registered')). null host (pass not found / soft-deleted) also
 *           trips this branch.
 *         · Other path (not admin, not resident): ForbiddenError('Only staff
 *           or the registering resident can revoke a pass').
 *     → revokeVisitorForCommunity(communityId, visitorId, actorUserId,
 *         body.reason ?? null, requestId)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * the body field then delegated to `resolveEffectiveCommunityId`) is now
 * expressed as Zod body validation + an explicit
 * `resolveEffectiveCommunityId(req, body.communityId)` call in the handler.
 * `parsePositiveInt(params.id, 'visitor id')` is now expressed via Zod params
 * coercion (`z.coerce.number().int().positive()`).
 *
 * The `body.reason ?? null` coercion is critical — the service signature is
 * `reason: string | null` (NOT `string | undefined`). When `reason` is
 * omitted, the handler passes `null` explicitly.
 *
 * `requestId` is forwarded as `req.headers.get('x-request-id')` which is
 * `string | null`. Both the present and absent cases are exercised by tests.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `revokeVisitorForCommunity` returns a `VisitorLogRow` that carries Date
 * fields (`revokedAt`, `expectedArrival`, etc.); a tight `z.object({...})`
 * schema would `safeParse`-fail against real Date instances before
 * `NextResponse.json` ISO-serializes them (drain #14/#18/#20/#32/#42/#46
 * precedent).
 *
 * `permission: { resource: 'visitors', action: 'write' }` —
 * `visitors` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 * Runtime permission gate runs inside `requireVisitorsWritePermission`.
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid revoke payload')`) shifts to
 * the canonical `VALIDATION_ERROR` envelope. Status code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const visitorsRevokeContract = defineRoute({
  method: 'POST',
  path: '/api/v1/visitors/[id]/revoke',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      reason: z.string().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'visitors', action: 'write' },
});
