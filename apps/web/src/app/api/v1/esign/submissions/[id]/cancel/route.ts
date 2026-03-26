import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEsignWritePermission } from '@/lib/esign/esign-route-helpers';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { cancelSubmission } from '@/lib/services/esign-service';

const cancelSchema = z.object({
  communityId: z.number().int().positive().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = Number(params?.id);
    if (!id || isNaN(id)) throw new BadRequestError('Invalid ID');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json().catch(() => ({}));
    const parseResult = cancelSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid cancel payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId =
      parseResult.data.communityId !== undefined
        ? parseCommunityIdFromBody(req, parseResult.data.communityId)
        : parseCommunityIdFromQuery(req);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const requestId = req.headers.get('x-request-id');
    await cancelSubmission(communityId, actorUserId, id, requestId);

    return NextResponse.json({ data: { success: true } });
  },
);
