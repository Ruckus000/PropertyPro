import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { requireEsignWritePermission } from '@/lib/esign/esign-route-helpers';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { sendReminder } from '@/lib/services/esign-service';

const remindSchema = z.object({
  communityId: z.number().int().positive(),
  signerId: z.number().int().positive(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = Number(params?.id);
    if (!id || isNaN(id)) throw new BadRequestError('Invalid ID');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = remindSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid remind payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const requestId = req.headers.get('x-request-id');
    await sendReminder(communityId, actorUserId, id, parseResult.data.signerId, requestId);

    return NextResponse.json({ success: true });
  },
);
