/**
 * Visitors — check out (staff-operator action).
 *
 * PATCH /api/v1/visitors/[id]/checkout
 * Body: { communityId }
 *
 * Plan A1 drain #66. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Sibling of drain #53
 * (visitors/checkin) — identical auth chain and shape. HTTP method is
 * PATCH (not POST) — visitor check-out is a state mutation on an existing
 * visitor record. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireVisitorLoggingEnabled  (ASYNC — awaited)
 *     → requireVisitorsWritePermission (sync)
 *     → requireStaffOperator           (sync)
 *     → checkOutVisitorForCommunity(communityId, visitorId, actorUserId, x-request-id)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `checkOutVisitorForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import { checkOutVisitorForCommunity } from '@/lib/services/package-visitor-service';
import { visitorsCheckoutContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(visitorsCheckoutContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);
    requireStaffOperator(membership);

    return checkOutVisitorForCommunity(
      communityId,
      params.id,
      actorUserId,
      req.headers.get('x-request-id'),
    );
  }),
);
