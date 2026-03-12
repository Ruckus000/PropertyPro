import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requirePollReadPermission,
  requirePollsEnabled,
} from '@/lib/polls/common';
import { getPollResultsForCommunity } from '@/lib/services/polls-service';

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const pollId = parsePositiveInt(params?.id ?? '', 'poll id');

    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requirePollsEnabled(membership);
    requirePollReadPermission(membership);

    const data = await getPollResultsForCommunity(communityId, pollId);
    return NextResponse.json({ data });
  },
);
