/**
 * Elections — revoke a proxy designation
 *
 * POST /api/v1/elections/[id]/proxies/[proxyId]/revoke
 * Body: { communityId }
 *
 * Plan A1 drain #49. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale.
 *
 * **Divergence from sibling drains #47 (approve) / #48 (reject)**: this
 * route has NO admin role gate. Non-admins can revoke their own proxy.
 * `revokeElectionProxyForCommunity` takes a 6th arg `actorIsAdmin: boolean`
 * derived from `membership.isAdmin`; the service applies the
 * ownership-vs-admin logic internally.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync, NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → revokeElectionProxyForCommunity(
 *         communityId, electionId, proxyId, actorUserId,
 *         membership.isAdmin, x-request-id,
 *       )
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]`/`[proxyId]`
 * and body validation failures shifts to the canonical `VALIDATION_ERROR`
 * envelope. Status unchanged. Success wire shape `{ data: ... }`
 * byte-identical.
 *
 * `x-request-id` header forwarded verbatim to
 * `revokeElectionProxyForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsEnabled } from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { revokeElectionProxyForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsProxiesRevokeContract } from './contract';

export const POST = withErrorHandler(
  runRoute(electionsProxiesRevokeContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'write');

    return revokeElectionProxyForCommunity(
      communityId,
      params.id,
      params.proxyId,
      actorUserId,
      membership.isAdmin,
      req.headers.get('x-request-id'),
    );
  }),
);
