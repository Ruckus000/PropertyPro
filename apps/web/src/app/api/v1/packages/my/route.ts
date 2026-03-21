import { NextResponse, type NextRequest } from 'next/server';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  isResidentRole,
  requireActorUnitIds,
  requirePackageLoggingEnabled,
  requirePackagesReadPermission,
} from '@/lib/logistics/common';
import { listMyPackagesForCommunity } from '@/lib/services/package-visitor-service';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requirePackageLoggingEnabled(membership);
  requirePackagesReadPermission(membership);

  if (!isResidentRole(membership.role)) {
    throw new ForbiddenError('Only residents can use the my-packages view');
  }

  const scoped = createScopedClient(communityId);
  const allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);
  const data = await listMyPackagesForCommunity(communityId, allowedUnitIds);

  return NextResponse.json({ data });
});
