import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { getActorUnitIds, requireArcEnabled, requireArcSubmitterRole, requireArcWritePermission } from '@/lib/violations/common';
import { parsePositiveInt } from '@/lib/finance/common';
import { withdrawArcSubmissionForCommunity } from '@/lib/services/violations-service';

const withdrawSchema = z.object({
  communityId: z.number().int().positive(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'ARC submission id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = withdrawSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid ARC withdraw payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireArcEnabled(membership);
    requireArcWritePermission(membership);
    requireArcSubmitterRole(membership);

    const scoped = createScopedClient(communityId);
    const unitIds = await getActorUnitIds(scoped, actorUserId);

    const requestId = req.headers.get('x-request-id');
    const data = await withdrawArcSubmissionForCommunity(
      communityId,
      id,
      actorUserId,
      unitIds,
      requestId,
    );

    return NextResponse.json({ data });
  },
);
