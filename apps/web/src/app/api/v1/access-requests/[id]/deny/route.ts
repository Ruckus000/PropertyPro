/**
 * Access Request Denial
 *
 * POST /api/v1/access-requests/[id]/deny — admin: deny a pending access request
 *
 * Plan A1 drain #40. Migrated to `runRoute(contract, handler)` from
 * `@propertypro/api-contract`. See `./contract.ts` for the wire shape and
 * the documented 400-envelope behavior change.
 *
 * Auth chain (preserved verbatim from pre-migration):
 *   requireAuthenticatedUserId → resolveEffectiveCommunityId(req, null)
 *   → assertNotDemoGrace → requireCommunityMembership
 *   → requirePermission('residents', 'write') → denyAccessRequest.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { denyAccessRequest } from '@/lib/services/access-request-service';
import { accessRequestsDenyContract } from './contract';

export const POST = withErrorHandler(
  runRoute(accessRequestsDenyContract, async ({ params, body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');

    await denyAccessRequest({
      requestId: params.id,
      communityId: membership.communityId,
      reviewerId: userId,
      reason: body.reason,
    });

    return { success: true as const };
  }),
);
