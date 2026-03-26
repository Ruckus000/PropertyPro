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
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { initiateGoogleCalendarConnect } from '@/lib/services/calendar-sync-service';

const connectSchema = z.object({
  communityId: z.number().int().positive(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = connectSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid calendar connect payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireCalendarSyncEnabledForMembership(membership);
  requireCalendarSyncWritePermission(membership);

  const data = await initiateGoogleCalendarConnect(communityId, actorUserId);
  return NextResponse.json({ data });
});
