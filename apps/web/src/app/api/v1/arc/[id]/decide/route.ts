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
import { decideArcSubmissionForCommunity } from '@/lib/services/violations-service';

const decideSchema = z.object({
  communityId: z.number().int().positive(),
  decision: z.enum(['approved', 'denied']),
  reviewNotes: z.string().max(4000).nullable().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'ARC submission id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = decideSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid ARC decision payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireArcEnabled(membership);
    requireArcReadPermission(membership);
    requireArcWritePermission(membership);
    requireArcReviewPermission(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await decideArcSubmissionForCommunity(
      communityId,
      id,
      actorUserId,
      {
        decision: parseResult.data.decision,
        reviewNotes: parseResult.data.reviewNotes ?? null,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);
