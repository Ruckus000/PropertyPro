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
import { revokeElectionProxyForCommunity } from '@/lib/services/elections-service';

const proxyMutationSchema = z.object({
  communityId: z.number().int().positive(),
});

export const POST = withErrorHandler(
  async (
    req: NextRequest,
    context?: { params: Promise<Record<string, string>> },
  ) => {
    const params = await context?.params;
    const electionId = parsePositiveInt(params?.id ?? '', 'election id');
    const proxyId = parsePositiveInt(params?.proxyId ?? '', 'proxy id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = proxyMutationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid proxy revoke payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requireElectionsWritePermission(membership);

    const actorIsAdmin = membership.isAdmin;

    const data = await revokeElectionProxyForCommunity(
      communityId,
      electionId,
      proxyId,
      actorUserId,
      actorIsAdmin,
      req.headers.get('x-request-id'),
    );

    return NextResponse.json({ data });
  },
);
