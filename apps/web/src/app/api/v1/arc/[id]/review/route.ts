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
  requireArcEnabled,
  requireArcReadPermission,
  requireArcReviewPermission,
  requireArcWritePermission,
} from '@/lib/violations/common';
import { reviewArcSubmissionForCommunity } from '@/lib/services/violations-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const reviewSchema = z.object({
  communityId: z.number().int().positive(),
  reviewNotes: z.string().max(4000).nullable().optional(),
});

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'ARC submission id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = reviewSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid ARC review payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireArcEnabled(membership);
    requireArcReadPermission(membership);
    requireArcWritePermission(membership);
    requireArcReviewPermission(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await reviewArcSubmissionForCommunity(
      communityId,
      id,
      actorUserId,
      {
        reviewNotes: parseResult.data.reviewNotes ?? null,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);
