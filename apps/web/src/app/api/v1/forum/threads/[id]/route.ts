import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireCommunityBoardEnabled,
  requireForumModerationPermission,
  requirePollReadPermission,
  requirePollWritePermission,
} from '@/lib/polls/common';
import {
  deleteForumThreadForCommunity,
  getForumThreadWithRepliesForCommunity,
  updateForumThreadForCommunity,
} from '@/lib/services/polls-service';

const updateThreadSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240).optional(),
  body: z.string().trim().min(1).max(8000).optional(),
  isPinned: z.boolean().optional(),
  isLocked: z.boolean().optional(),
});

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const threadId = parsePositiveInt(params?.id ?? '', 'thread id');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollReadPermission(membership);

    const data = await getForumThreadWithRepliesForCommunity(communityId, threadId);
    return NextResponse.json({ data });
  },
);

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const threadId = parsePositiveInt(params?.id ?? '', 'thread id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = updateThreadSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid thread update payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    if (
      parsed.data.title === undefined
      && parsed.data.body === undefined
      && parsed.data.isPinned === undefined
      && parsed.data.isLocked === undefined
    ) {
      throw new ValidationError('At least one field must be provided for update');
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollWritePermission(membership);
    requireForumModerationPermission(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await updateForumThreadForCommunity(
      communityId,
      threadId,
      actorUserId,
      {
        title: parsed.data.title,
        body: parsed.data.body,
        isPinned: parsed.data.isPinned,
        isLocked: parsed.data.isLocked,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const threadId = parsePositiveInt(params?.id ?? '', 'thread id');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollWritePermission(membership);
    requireForumModerationPermission(membership);

    const requestId = req.headers.get('x-request-id');
    await deleteForumThreadForCommunity(communityId, threadId, actorUserId, requestId);

    return NextResponse.json({ data: { id: threadId, deleted: true } });
  },
);
