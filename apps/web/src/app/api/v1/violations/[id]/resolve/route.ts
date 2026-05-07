import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import { requireViolationAdminWrite, requireViolationsEnabled } from '@/lib/violations/common';
import { resolveViolationForCommunity } from '@/lib/services/violations-service';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import { requirePermission } from '@/lib/db/access-control';

const resolveSchema = z.object({
  communityId: z.number().int().positive(),
  resolutionNotes: z.string().max(4000).nullable().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'violation id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = resolveSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid resolve payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireViolationsEnabled(membership);
    requirePermission(membership, 'violations', 'write');
    requireViolationAdminWrite(membership);

    const requestId = req.headers.get('x-request-id');
    const sanitizedNotes =
      parseResult.data.resolutionNotes != null
        ? sanitizeHtml(parseResult.data.resolutionNotes)
        : null;
    const data = await resolveViolationForCommunity(
      communityId,
      id,
      actorUserId,
      sanitizedNotes,
      requestId,
    );
    return NextResponse.json({ data });
  },
);
