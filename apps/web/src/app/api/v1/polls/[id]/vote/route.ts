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
  requirePollWritePermission,
  requirePollsEnabled,
} from '@/lib/polls/common';
import { castPollVoteForCommunity } from '@/lib/services/polls-service';

const castVoteSchema = z.object({
  communityId: z.number().int().positive(),
  selectedOptions: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const pollId = parsePositiveInt(params?.id ?? '', 'poll id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = castVoteSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid vote payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requirePollsEnabled(membership);
    requirePollWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await castPollVoteForCommunity(
      communityId,
      pollId,
      actorUserId,
      {
        selectedOptions: parsed.data.selectedOptions,
      },
      requestId,
    );

    return NextResponse.json({ data }, { status: 201 });
  },
);
