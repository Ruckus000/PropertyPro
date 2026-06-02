/**
 * Forum thread replies — create + soft-delete.
 *
 * POST   /api/v1/forum/threads/[id]/reply  — create a reply
 * DELETE /api/v1/forum/threads/[id]/reply  — author or moderator soft-delete
 *
 * Plan A1 drain #90. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and rationale.
 *
 * Auth chains preserved verbatim from the pre-migration handler:
 *   POST:    requireAuthenticatedUserId → resolveEffectiveCommunityId →
 *            assertNotDemoGrace → requireCommunityMembership →
 *            requireCommunityBoardEnabled → requirePollWritePermission →
 *            createForumReplyForCommunity(communityId, params.id,
 *              actorUserId, body.body, x-request-id)
 *   DELETE:  same prefix, then
 *            canModerateReplies = membership.isAdmin &&
 *              checkPermissionV2(role, communityType, 'polls', 'write',
 *                { isUnitOwner, permissions }) →
 *            deleteForumReplyForCommunity(communityId, params.id,
 *              body.replyId, actorUserId, canModerateReplies,
 *              x-request-id, body.moderationReason)
 *
 * The `&&` short-circuit on `canModerateReplies` is preserved verbatim — when
 * `membership.isAdmin === false`, `checkPermissionV2` is NOT invoked.
 *
 * Behavior change vs. pre-migration: `ValidationError('Invalid reply payload')`
 * / `'Invalid reply moderation payload'` shifts to the canonical
 * `VALIDATION_ERROR` envelope. Status code 400 unchanged. Success wire shape
 * `{ data: ... }` byte-identical for both methods.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { checkPermissionV2 } from '@/lib/db/access-control';
import {
  requireCommunityBoardEnabled,
  requirePollWritePermission,
} from '@/lib/polls/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  createForumReplyForCommunity,
  deleteForumReplyForCommunity,
} from '@/lib/services/polls-service';
import {
  forumReplyCreateContract,
  forumReplyDeleteContract,
} from './contract';

export const POST = withErrorHandler(
  runRoute(forumReplyCreateContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollWritePermission(membership);

    return createForumReplyForCommunity(
      communityId,
      params.id,
      actorUserId,
      body.body,
      req.headers.get('x-request-id'),
    );
  }),
);

export const DELETE = withErrorHandler(
  runRoute(forumReplyDeleteContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollWritePermission(membership);

    const canModerateReplies =
      membership.isAdmin &&
      checkPermissionV2(
        membership.role,
        membership.communityType,
        'polls',
        'write',
        {
          isUnitOwner: membership.isUnitOwner,
          permissions: membership.permissions,
        },
      );

    await deleteForumReplyForCommunity(
      communityId,
      params.id,
      body.replyId,
      actorUserId,
      canModerateReplies,
      req.headers.get('x-request-id'),
      body.moderationReason,
    );

    return { id: body.replyId, deleted: true as const };
  }),
);
