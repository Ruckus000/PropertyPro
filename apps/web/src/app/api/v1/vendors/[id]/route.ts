/**
 * Vendors — update a vendor (admin-facing).
 *
 * PATCH /api/v1/vendors/[id]
 * Body: { communityId, name?, company?, phone?, email?, specialties?, isActive? }
 *
 * Plan A1 drain #74. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Mirrors drain #63
 * (`work-orders/[id]/complete`) auth chain with a richer body.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireWorkOrdersEnabled (sync, NOT awaited)
 *     → requirePlanFeature(communityId, 'hasWorkOrders') (async — awaited)
 *     → requireWorkOrdersWritePermission (sync)
 *     → requireWorkOrderAdminWrite (sync)
 *     → updateVendorForCommunity(communityId, vendorId, actorUserId, fields, x-request-id)
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures shifts to the canonical `VALIDATION_ERROR` envelope.
 * Status unchanged. Success wire shape `{ data: ... }` byte-identical.
 *
 * `x-request-id` header forwarded verbatim to `updateVendorForCommunity`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  requireWorkOrderAdminWrite,
  requireWorkOrdersEnabled,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import { updateVendorForCommunity } from '@/lib/services/work-orders-service';
import { vendorsUpdateContract } from './contract';

export const PATCH = withErrorHandler(
  runRoute(vendorsUpdateContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    await requirePlanFeature(communityId, 'hasWorkOrders');
    requireWorkOrdersWritePermission(membership);
    requireWorkOrderAdminWrite(membership);

    return updateVendorForCommunity(
      communityId,
      params.id,
      actorUserId,
      {
        name: body.name,
        company: body.company,
        phone: body.phone,
        email: body.email,
        specialties: body.specialties,
        isActive: body.isActive,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
