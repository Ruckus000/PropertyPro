import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireCommunityBoardEnabled,
  requireForumModerationPermission,
  requirePollReadPermission,
  requirePollWritePermission,
} from '@/lib/polls/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  deleteForumThreadForCommunity,
  getForumThreadWithRepliesForCommunity,
  updateForumThreadForCommunity,
} from '@/lib/services/polls-service';
import {
  forumThreadDeleteContract,
  forumThreadDetailGetContract,
  forumThreadUpdateContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(forumThreadDetailGetContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollReadPermission(membership);

    return getForumThreadWithRepliesForCommunity(communityId, params.id);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(forumThreadUpdateContract, async ({ params, body, req }) => {
    if (
      body.title === undefined
      && body.body === undefined
      && body.isPinned === undefined
      && body.isLocked === undefined
    ) {
      throw new ValidationError('At least one field must be provided for update');
    }

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollWritePermission(membership);
    requireForumModerationPermission(membership);

    const requestId = req.headers.get('x-request-id');
    return updateForumThreadForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        title: body.title,
        body: body.body,
        isPinned: body.isPinned,
        isLocked: body.isLocked,
      },
      requestId,
    );
  }),
);

export const DELETE = withErrorHandler(
  runRoute(forumThreadDeleteContract, async ({ params, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollWritePermission(membership);
    requireForumModerationPermission(membership);

    const requestId = req.headers.get('x-request-id');
    await deleteForumThreadForCommunity(communityId, params.id, actorUserId, requestId);

    return { id: params.id, deleted: true as const };
  }),
);
