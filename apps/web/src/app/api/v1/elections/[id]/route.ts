import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireElectionsEnabled, requireElectionsReadPermission } from '@/lib/elections/common';
import { parsePositiveInt } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { getElectionDetailForCommunity } from '@/lib/services/elections-service';

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const electionId = parsePositiveInt(params?.id ?? '', 'election id');
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requireElectionsReadPermission(membership);

    const data = await getElectionDetailForCommunity(communityId, electionId);
    return NextResponse.json({ data });
  },
);
