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
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
} from '@/lib/logistics/common';
import {
  listMyVisitorsForCommunity,
  listVisitorsForCommunity,
} from '@/lib/services/package-visitor-service';
import { deriveVisitorStatus } from '@/lib/visitors/visitor-logic';

/** Strip passCode from resident responses — mirrors the guard in GET /visitors */
function stripPassCode<T extends Record<string, unknown>>(rows: T[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return rows.map(({ passCode, ...rest }) => rest);
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsReadPermission(membership);

  if (!isResidentRole(membership.role)) {
    throw new ForbiddenError('Only residents can use the my-visitors view');
  }

  const scoped = createScopedClient(communityId);
  const allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') ?? undefined;

  if (!filter) {
    // Default behavior: active passes (not checked out)
    const data = await listMyVisitorsForCommunity(communityId, actorUserId, allowedUnitIds);
    return NextResponse.json({ data: stripPassCode(data) });
  }

  if (filter === 'active') {
    const rows = await listVisitorsForCommunity(communityId, {
      allowedUnitIds,
      hostUserId: actorUserId,
      status: 'checked_in',
    });
    return NextResponse.json({ data: stripPassCode(rows) });
  }

  if (filter === 'upcoming') {
    const rows = await listVisitorsForCommunity(communityId, {
      allowedUnitIds,
      hostUserId: actorUserId,
      status: 'expected',
    });
    return NextResponse.json({ data: stripPassCode(rows) });
  }

  if (filter === 'past') {
    const rows = await listVisitorsForCommunity(communityId, {
      allowedUnitIds,
      hostUserId: actorUserId,
      onlyActive: false,
    });
    const pastStatuses = new Set(['checked_out', 'expired', 'revoked', 'revoked_on_site']);
    const filtered = rows.filter((row) => pastStatuses.has(deriveVisitorStatus(row)));
    return NextResponse.json({ data: stripPassCode(filtered) });
  }

  // Unknown filter — fall back to default behavior
  const data = await listMyVisitorsForCommunity(communityId, actorUserId, allowedUnitIds);
  return NextResponse.json({ data: stripPassCode(data) });
});
