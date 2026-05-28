/**
 * Vendors API — list + create.
 *
 * GET  /api/v1/vendors — paginated vendor directory (Plan A1 drain #96)
 * POST /api/v1/vendors — create vendor (admin-facing)
 *
 * Plan A1 drain #96. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and rationale. Mirrors drain #74
 * (`vendors/[id]` PATCH) work-orders auth chain.
 *
 * GET auth chain (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requireWorkOrdersEnabled (sync — NOT awaited)
 *     → requirePlanFeature(communityId, 'hasWorkOrders') (async — awaited)
 *     → requireWorkOrdersReadPermission (sync)
 *     → paginateVendorsForCommunity
 *
 * POST auth chain (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireWorkOrdersEnabled (sync)
 *     → requirePlanFeature(communityId, 'hasWorkOrders') (async)
 *     → requireWorkOrdersWritePermission (sync)
 *     → requireWorkOrderAdminWrite (sync)
 *     → createVendorForCommunity(..., x-request-id)
 *
 * `parseCommunityIdFromQuery` / `parseCommunityIdFromBody` replaced with Zod
 * contract validation + explicit `resolveEffectiveCommunityId` — same
 * header/query reconciliation as pre-migration (both helpers delegated).
 *
 * Behavior change vs. pre-migration: 400 body for validation failures uses
 * the canonical `VALIDATION_ERROR` envelope. GET query failures keep message
 * `Invalid query parameters` with `fields` (runner default). Status codes
 * unchanged. Success wire shapes byte-identical.
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
  requireWorkOrdersReadPermission,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import {
  createVendorForCommunity,
  paginateVendorsForCommunity,
} from '@/lib/services/work-orders-service';
import { vendorsCreateContract, vendorsListGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(vendorsListGetContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    await requirePlanFeature(communityId, 'hasWorkOrders');
    requireWorkOrdersReadPermission(membership);

    const result = await paginateVendorsForCommunity(communityId, {
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);

export const POST = withErrorHandler(
  runRoute(vendorsCreateContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireWorkOrdersEnabled(membership);
    await requirePlanFeature(communityId, 'hasWorkOrders');
    requireWorkOrdersWritePermission(membership);
    requireWorkOrderAdminWrite(membership);

    return createVendorForCommunity(
      communityId,
      actorUserId,
      {
        name: body.name,
        company: body.company ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        specialties: body.specialties,
        isActive: body.isActive,
      },
      req.headers.get('x-request-id'),
    );
  }),
);
