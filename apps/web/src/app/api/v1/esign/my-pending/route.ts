/**
 * GET /api/v1/esign/my-pending?communityId=X
 *
 * Returns pending e-sign requests for the authenticated user.
 * Available to all roles with esign.read permission (owner, tenant, admin).
 *
 * Plan A1 drain #20: input validation (query) and output envelope wrapping
 * delegated to `runRoute()` from `@propertypro/api-contract`. Auth chain
 * preserved verbatim — pre-migration used `parseCommunityIdFromQuery`,
 * which already delegates to `resolveEffectiveCommunityId` (drain #10
 * lesson). The wire shape is `{ data: T[] }`, unchanged.
 *
 * Plan A3 Phase 2 (#242 follow-on, retained): the email lookup that
 * previously lived inline in this route is folded into
 * `listMyPendingForActor` in esign-service.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEsignReadPermission } from '@/lib/esign/esign-route-helpers';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { listMyPendingForActor } from '@/lib/services/esign-service';
import { esignMyPendingContract } from './contract';

export const GET = withErrorHandler(
  runRoute(esignMyPendingContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    return listMyPendingForActor(communityId, actorUserId);
  }),
);
