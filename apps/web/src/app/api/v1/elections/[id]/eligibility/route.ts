/**
 * Election Eligibility Snapshot
 *
 * POST /api/v1/elections/[id]/eligibility — admin: take a manual eligibility
 * snapshot for an election.
 *
 * Plan A1 drain #44. Input validation (params + body) and output envelope
 * wrapping delegated to `runRoute()` from `@propertypro/api-contract`. Auth
 * chain preserved verbatim:
 *   requireAuthenticatedUserId → resolveEffectiveCommunityId(req, body.communityId)
 *   → assertNotDemoGrace → requireCommunityMembership
 *   → requireElectionsEnabled → requirePermission('elections', 'write')
 *   → requireElectionsAdminRole → snapshotElectionEligibilityForCommunity.
 *
 * Because the contract body schema enforces `communityId` as a positive
 * integer, the pre-migration `parseCommunityIdFromBody` positive-int guard
 * is now redundant and collapses to a plain `resolveEffectiveCommunityId`
 * call.
 *
 * Behavior change vs. pre-migration:
 *   - Invalid `params.id` (non-numeric, zero, negative) and invalid body
 *     (e.g., `communityId: 0` or missing) now return the runner's canonical
 *     `VALIDATION_ERROR` envelope instead of the bespoke
 *     `ValidationError('Invalid election eligibility payload')` /
 *     `parsePositiveInt('election id')` throws. Status code 400 unchanged.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireElectionsAdminRole, requireElectionsEnabled } from '@/lib/elections/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { snapshotElectionEligibilityForCommunity } from '@/lib/services/elections-service';
import { requirePermission } from '@/lib/db/access-control';
import { electionsEligibilityContract } from './contract';

export const POST = withErrorHandler(
  runRoute(electionsEligibilityContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireElectionsEnabled(membership);
    requirePermission(membership, 'elections', 'write');
    requireElectionsAdminRole(membership);

    const requestId = req.headers.get('x-request-id');
    return snapshotElectionEligibilityForCommunity(
      communityId,
      params.id,
      actorUserId,
      requestId,
    );
  }),
);
