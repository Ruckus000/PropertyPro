import { NextResponse, type NextRequest } from 'next/server';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  getActorUnitIds,
  isResidentRole,
  requireArcEnabled,
  requireArcReadPermission,
} from '@/lib/violations/common';
import { getArcSubmissionForCommunity } from '@/lib/services/violations-service';

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'ARC submission id');
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireArcEnabled(membership);
    requireArcReadPermission(membership);

    const scoped = createScopedClient(communityId);
    const residentUnitIds = isResidentRole(membership.role)
      ? await getActorUnitIds(scoped, actorUserId)
      : undefined;

    const data = await getArcSubmissionForCommunity(communityId, id, residentUnitIds);
    return NextResponse.json({ data });
  },
);
