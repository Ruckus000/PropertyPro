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
  requireViolationAdminWrite,
  requireViolationsEnabled,
  requireViolationsWritePermission,
} from '@/lib/violations/common';
import { dismissViolationForCommunity } from '@/lib/services/violations-service';

const dismissSchema = z.object({
  communityId: z.number().int().positive(),
  resolutionNotes: z.string().max(4000).nullable().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'violation id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = dismissSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid dismiss payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requireViolationsEnabled(membership);
    requireViolationsWritePermission(membership);
    requireViolationAdminWrite(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await dismissViolationForCommunity(
      communityId,
      id,
      actorUserId,
      parseResult.data.resolutionNotes ?? null,
      requestId,
    );
    return NextResponse.json({ data });
  },
);
