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
  requireElectionsEnabled,
  requireElectionsWritePermission,
} from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { castElectionVoteForCommunity } from '@/lib/services/elections-service';

const castElectionVoteSchema = z.object({
  communityId: z.number().int().positive(),
  selectedCandidateIds: z.array(z.number().int().positive()).max(25).optional(),
  isAbstention: z.boolean().optional(),
  proxyId: z.number().int().positive().nullable().optional(),
  unitId: z.number().int().positive().nullable().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const electionId = parsePositiveInt(params?.id ?? '', 'election id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = castElectionVoteSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid election vote payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requireElectionsWritePermission(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await castElectionVoteForCommunity(
      communityId,
      electionId,
      actorUserId,
      {
        selectedCandidateIds: parsed.data.selectedCandidateIds,
        isAbstention: parsed.data.isAbstention,
        proxyId: parsed.data.proxyId ?? null,
        unitId: parsed.data.unitId ?? null,
      },
      requestId,
    );

    return NextResponse.json({ data }, { status: 201 });
  },
);
