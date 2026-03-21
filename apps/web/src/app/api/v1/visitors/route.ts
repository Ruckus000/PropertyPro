import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  isResidentRole,
  requireActorUnitIds,
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import {
  createVisitorForCommunity,
  listVisitorsForCommunity,
} from '@/lib/services/package-visitor-service';

const createVisitorSchema = z.object({
  communityId: z.number().int().positive(),
  visitorName: z.string().trim().min(1).max(240),
  purpose: z.string().trim().min(1).max(240),
  hostUnitId: z.number().int().positive(),
  expectedArrival: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawHostUnitId = searchParams.get('hostUnitId');
  const hostUnitId = rawHostUnitId ? parsePositiveInt(rawHostUnitId, 'hostUnitId') : undefined;
  const onlyActive = searchParams.get('active') === 'true';

  let allowedUnitIds: number[] | undefined;
  if (isResidentRole(membership.role)) {
    const scoped = createScopedClient(communityId);
    allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

    if (hostUnitId !== undefined && !allowedUnitIds.includes(hostUnitId)) {
      throw new ForbiddenError('You can only view visitors for your own unit');
    }
  }

  const visitors = await listVisitorsForCommunity(communityId, {
    hostUnitId,
    onlyActive,
    allowedUnitIds,
  });

  // Strip sensitive access-control field from resident responses
  if (isResidentRole(membership.role)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sanitized = visitors.map(({ passCode, ...rest }) => rest);
    return NextResponse.json({ data: sanitized });
  }

  return NextResponse.json({ data: visitors });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createVisitorSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid visitor payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsWritePermission(membership);

  const scoped = createScopedClient(communityId);
  if (isResidentRole(membership.role)) {
    const allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);
    if (!allowedUnitIds.includes(parsed.data.hostUnitId)) {
      throw new ForbiddenError('You can only create visitor passes for your own unit');
    }
  } else {
    requireStaffOperator(membership);
  }

  const requestId = req.headers.get('x-request-id');
  const data = await createVisitorForCommunity(
    communityId,
    actorUserId,
    {
      visitorName: parsed.data.visitorName,
      purpose: parsed.data.purpose,
      hostUnitId: parsed.data.hostUnitId,
      expectedArrival: parsed.data.expectedArrival,
      notes: parsed.data.notes ?? null,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
