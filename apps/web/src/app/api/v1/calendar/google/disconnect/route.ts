import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import {
  requireCalendarSyncEnabledForMembership,
  requireCalendarSyncWritePermission,
} from '@/lib/calendar/common';
import { disconnectGoogleCalendar } from '@/lib/services/calendar-sync-service';

const disconnectSchema = z.object({
  communityId: z.number().int().positive(),
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = disconnectSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid calendar disconnect payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireCalendarSyncEnabledForMembership(membership);
  requireCalendarSyncWritePermission(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await disconnectGoogleCalendar(communityId, actorUserId, requestId);

  return NextResponse.json({ data });
});
