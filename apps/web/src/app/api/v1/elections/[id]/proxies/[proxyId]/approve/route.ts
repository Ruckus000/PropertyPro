/**
 * Elections — approve a proxy designation
 *
 * POST /api/v1/elections/[id]/proxies/[proxyId]/approve
 * Body: { communityId }
 *
 * Plan A1 drain #47. **First two-param route in the corpus.** Migrated to
 * `runRoute(contract, handler)`; see `./contract.ts` for the schema and
 * rationale. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync, NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → requireElectionsAdminRole
 *     → approveElectionProxyForCommunity(
 *         communityId, electionId, proxyId, actorUserId, x-request-id,
 *       )
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]`/`[proxyId]`
 * and body validation failures shifts to the canonical `VALIDATION_ERROR`
 * envelope. Status unchanged. Success wire shape `{ data: ... }`
 * byte-identical.
 *
 * `x-request-id` header forwarded verbatim to
 * `approveElectionProxyForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsAdminRole, requireElectionsEnabled } from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { approveElectionProxyForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsProxiesApproveContract } from './contract';

export const POST = withErrorHandler(
  runRoute(electionsProxiesApproveContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'write');
    requireElectionsAdminRole(membership);

    return approveElectionProxyForCommunity(
      communityId,
      params.id,
      params.proxyId,
      actorUserId,
      req.headers.get('x-request-id'),
    );
  }),
);
