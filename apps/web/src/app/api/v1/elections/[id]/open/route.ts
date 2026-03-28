import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parsePositiveInt } from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import {
  requireElectionsAdminRole,
  requireElectionsEnabled,
  requireElectionsWritePermission,
} from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { openElectionForCommunity } from '@/lib/services/elections-service';

const stateTransitionSchema = z.object({
  communityId: z.number().int().positive(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const electionId = parsePositiveInt(params?.id ?? '', 'election id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = stateTransitionSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid election open payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requireElectionsWritePermission(membership);
    requireElectionsAdminRole(membership);

    const data = await openElectionForCommunity(
      communityId,
      electionId,
      actorUserId,
      req.headers.get('x-request-id'),
    );

    return NextResponse.json({ data });
  },
);
