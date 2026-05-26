/**
 * Packages — pickup (staff-operator action).
 *
 * PATCH /api/v1/packages/[id]/pickup
 * Body: { communityId, pickedUpByName }
 *
 * Plan A1 drain #69. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. HTTP method is PATCH
 * (not POST) — package pickup is a state mutation on an existing
 * package record. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePackageLoggingEnabled  (ASYNC — awaited)
 *     → requirePackagesWritePermission (sync)
 *     → requireStaffOperator           (sync)
 *     → pickupPackageForCommunity(communityId, packageId, actorUserId, { pickedUpByName }, x-request-id)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `pickupPackageForCommunity`.
 * Service arg shape is object `{ pickedUpByName }` as the 4th positional
 * argument (NOT a positional string).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  requirePackageLoggingEnabled,
  requirePackagesWritePermission,
  requireStaffOperator,
} from '@/lib/logistics/common';
import { pickupPackageForCommunity } from '@/lib/services/package-visitor-service';
import { packagesPickupContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(packagesPickupContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requirePackageLoggingEnabled(membership);
    requirePackagesWritePermission(membership);
    requireStaffOperator(membership);

    return pickupPackageForCommunity(
      communityId,
      params.id,
      actorUserId,
      { pickedUpByName: body.pickedUpByName },
      req.headers.get('x-request-id'),
    );
  }),
);
