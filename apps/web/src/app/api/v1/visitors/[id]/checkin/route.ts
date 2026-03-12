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
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import { checkInVisitorForCommunity } from '@/lib/services/package-visitor-service';

const checkInSchema = z.object({
  communityId: z.number().int().positive(),
});

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const visitorId = parsePositiveInt(params?.id ?? '', 'visitor id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = checkInSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid visitor check-in payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);
    requireStaffOperator(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await checkInVisitorForCommunity(
      communityId,
      visitorId,
      actorUserId,
      requestId,
    );

    return NextResponse.json({ data });
  },
);
