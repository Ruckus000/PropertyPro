/**
 * Route contracts for `POST` + `DELETE /api/v1/forum/threads/[id]/reply`.
 *
 * Plan A1 drain #90. Two-method file: POST creates a forum reply, DELETE
 * soft-deletes one. Both methods share an identical auth prefix:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace (async)
 *     → requireCommunityMembership
 *     → requireCommunityBoardEnabled (sync)
 *     → requirePollWritePermission (sync)
 *
 * POST then calls:
 *   createForumReplyForCommunity(communityId, params.id, actorUserId,
 *     body.body, x-request-id)
 *
 * DELETE additionally computes:
 *   canModerateReplies = membership.isAdmin && checkPermissionV2(
 *     membership.role, membership.communityType, 'polls', 'write',
 *     { isUnitOwner: membership.isUnitOwner },
 *   )
 * and passes it as the 5th positional arg to
 *   deleteForumReplyForCommunity(communityId, params.id, body.replyId,
 *     actorUserId, canModerateReplies, x-request-id, body.moderationReason)
 * so the service can distinguish author-self-delete from moderator removal.
 * The `&&` short-circuit semantics on `canModerateReplies` are preserved
 * verbatim — when `membership.isAdmin === false`, `checkPermissionV2` is NOT
 * invoked.
 *
 * `parsePositiveInt(params.id, 'thread id')` is now expressed via Zod params
 * coercion (`z.coerce.number().int().positive()`).
 * `parseCommunityIdFromBody(req, body.communityId)` is now expressed as Zod
 * body validation plus an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler.
 *
 * Response modeling:
 *   - POST returns `ForumReplyRecord` (from `mapForumReplyRow`) which carries
 *     `Date` fields (`createdAt`, `updatedAt`, `deletedAt`). A tight
 *     `z.object({...})` would `safeParse`-fail against real Date instances
 *     before `NextResponse.json` ISO-serializes them, so the response is
 *     intentionally loose `z.unknown()` (drain #14/#18/#20/#32/#42/#46/#50
 *     precedent).
 *   - DELETE returns a route-synthesized object `{ id: <replyId>, deleted: true }`
 *     with no Date fields, so it is modeled tightly.
 *
 * `permission: { resource: 'polls', action: 'write' }` matches the runtime
 * `requirePollWritePermission(membership)` call (which delegates to
 * `requirePermission(membership, 'polls', 'write')`). `polls` IS in
 * `RBAC_RESOURCES` at `packages/shared/src/rbac-matrix.ts:44` (non-placeholder).
 *
 * Behavior change vs. pre-migration: the bespoke `ValidationError('Invalid reply payload')`
 * and `ValidationError('Invalid reply moderation payload')` message literals
 * shift to the canonical `VALIDATION_ERROR` envelope. Status code 400
 * unchanged. Success wire shape `{ data: ... }` byte-identical for both
 * methods. Consumer hooks at `apps/web/src/hooks/use-board.ts:537,553` use
 * `requestJson<T>` which auto-unwraps `.data` and rethrows by status — safe.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const PARAMS = z.object({
  id: z.coerce.number().int().positive(),
});

export const forumReplyCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/forum/threads/[id]/reply',
  request: {
    params: PARAMS,
    body: z.object({
      communityId: z.number().int().positive(),
      body: z.string().trim().min(1).max(8000),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'polls', action: 'write' },
});

export const forumReplyDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/forum/threads/[id]/reply',
  request: {
    params: PARAMS,
    body: z.object({
      communityId: z.number().int().positive(),
      replyId: z.number().int().positive(),
      moderationReason: z.string().trim().min(1).max(500).optional(),
    }),
  },
  response: z.object({
    id: z.number().int().positive(),
    deleted: z.literal(true),
  }),
  permission: { resource: 'polls', action: 'write' },
});
