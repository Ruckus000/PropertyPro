import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { parsePositiveInt } from '@/lib/finance/common';
import { requireElectionsEnabled } from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requirePermission } from '@/lib/db/access-control';
import { createElectionProxyForCommunity, listElectionProxiesForCommunity } from '@/lib/services/elections-service';
import { electionsProxiesCreateContract, electionsProxiesListContract } from './contract';

export const GET = withErrorHandler(
  runRoute(electionsProxiesListContract, async ({ params, query, req }) => {
    const electionId = parsePositiveInt(params.id, 'election id');
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    return listElectionProxiesForCommunity(communityId, electionId);
  }),
);

export const POST = withErrorHandler(
  runRoute(electionsProxiesCreateContract, async ({ params, body, req }) => {
    const electionId = parsePositiveInt(params.id, 'election id');
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'write');

    return createElectionProxyForCommunity(
      communityId,
      electionId,
      actorUserId,
      {
        proxyHolderUserId: body.proxyHolderUserId,
        grantorUnitId: body.grantorUnitId ?? null,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
