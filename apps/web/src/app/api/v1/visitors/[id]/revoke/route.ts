import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError, ForbiddenError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireVisitorLoggingEnabled,
  requireVisitorsWritePermission,
  isResidentRole,
} from '@/lib/logistics/common';
import { revokeVisitorForCommunity } from '@/lib/services/package-visitor-service';
import { communities, visitorLog, createScopedClient } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';

const revokeSchema = z.object({
  communityId: z.number().int().positive(),
  reason: z.string().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const visitorId = parsePositiveInt(params?.id ?? '', 'visitor id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = revokeSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid revoke payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);

    if (membership.isAdmin) {
      if (!parsed.data.reason) {
        throw new ValidationError('Reason is required for staff revocations');
      }
    } else if (isResidentRole(membership.role)) {
      const scoped = createScopedClient(communityId);
      const communityRows = await scoped.selectFrom(
        communities,
        {},
        eq(communities.id, communityId),
      );
      const community = communityRows[0] as Record<string, unknown> | undefined;
      const settings = community?.communitySettings as Record<string, unknown> | undefined;

      if (!settings?.allowResidentVisitorRevoke) {
        throw new ForbiddenError(
          'Resident visitor pass revocation is not enabled for this community',
        );
      }

      const visitorRows = await scoped.selectFrom(
        visitorLog,
        {},
        and(eq(visitorLog.id, visitorId), isNull(visitorLog.deletedAt)),
      );
      const visitor = visitorRows[0];

      if (!visitor || visitor.hostUserId !== actorUserId) {
        throw new ForbiddenError('You can only revoke passes you registered');
      }
    } else {
      throw new ForbiddenError('Only staff or the registering resident can revoke a pass');
    }

    const requestId = req.headers.get('x-request-id');
    const data = await revokeVisitorForCommunity(
      communityId,
      visitorId,
      actorUserId,
      parsed.data.reason ?? null,
      requestId,
    );

    return NextResponse.json({ data });
  },
);
