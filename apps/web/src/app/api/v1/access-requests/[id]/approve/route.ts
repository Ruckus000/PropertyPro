/**
 * Access Request Approval
 *
 * POST /api/v1/access-requests/[id]/approve — admin: approve a pending access request
 *
 * Plan A1 drain #39. Input validation (params + body) and output envelope
 * wrapping delegated to `runRoute()` from `@propertypro/api-contract`. Auth
 * chain preserved verbatim:
 *   requireAuthenticatedUserId → resolveEffectiveCommunityId(req, null)
 *   → assertNotDemoGrace → requireCommunityMembership
 *   → requirePermission('residents', 'write') → approveAccessRequest.
 *
 * `resolveEffectiveCommunityId(req, null)` reads the `x-community-id`
 * header only (no `?communityId=` query param on this route). The contract
 * intentionally declares no `query` schema to match.
 *
 * Behavior change vs. pre-migration:
 *   - Invalid `params.id` (non-numeric, zero, negative) and invalid body
 *     (e.g., `unitId: 0`) now return the runner's canonical
 *     `VALIDATION_ERROR` envelope instead of the bespoke
 *     `ValidationError('Invalid request ID')` / `ValidationError('Validation
 *     failed')`. Status code 400 unchanged. Hooks read `!res.ok` opaquely.
 *   - The service call signature is preserved verbatim — uses
 *     `membership.communityId` (not the local `communityId`) to match the
 *     pre-migration argument shape.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { approveAccessRequest } from '@/lib/services/access-request-service';
import { accessRequestsApproveContract } from './contract';

export const POST = withErrorHandler(
  runRoute(accessRequestsApproveContract, async ({ params, body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'residents', 'write');

    return approveAccessRequest({
      requestId: params.id,
      communityId: membership.communityId,
      reviewerId: userId,
      unitId: body.unitId,
    });
  }),
);
