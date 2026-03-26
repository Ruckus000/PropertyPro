import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireCommunityBoardEnabled,
  requirePollWritePermission,
} from '@/lib/polls/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { createForumReplyForCommunity } from '@/lib/services/polls-service';

const createReplySchema = z.object({
  communityId: z.number().int().positive(),
  body: z.string().trim().min(1).max(8000),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const threadId = parsePositiveInt(params?.id ?? '', 'thread id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = createReplySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid reply payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireCommunityBoardEnabled(membership);
    requirePollWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await createForumReplyForCommunity(
      communityId,
      threadId,
      actorUserId,
      parsed.data.body,
      requestId,
    );

    return NextResponse.json({ data }, { status: 201 });
  },
);
