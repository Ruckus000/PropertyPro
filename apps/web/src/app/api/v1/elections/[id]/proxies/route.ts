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
import { createElectionProxyForCommunity } from '@/lib/services/elections-service';

const createElectionProxySchema = z.object({
  communityId: z.number().int().positive(),
  proxyHolderUserId: z.string().uuid(),
  grantorUnitId: z.number().int().positive().nullable().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const electionId = parsePositiveInt(params?.id ?? '', 'election id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = createElectionProxySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid election proxy payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requireElectionsWritePermission(membership);

    const data = await createElectionProxyForCommunity(
      communityId,
      electionId,
      actorUserId,
      {
        proxyHolderUserId: parsed.data.proxyHolderUserId,
        grantorUnitId: parsed.data.grantorUnitId ?? null,
      },
      req.headers.get('x-request-id'),
    );

    return NextResponse.json({ data }, { status: 201 });
  },
);
