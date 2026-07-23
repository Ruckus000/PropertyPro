/**
 * GET /api/v1/operations — unified operations feed
 *
 * Plan A1 drain #177 — migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 * Preserves bespoke 503 when all sources are unavailable (route-level dispatch).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { runRoute } from '@propertypro/api-contract';
import { getFeaturesForCommunity, type CommunityFeatures } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { listOperationsForCommunity } from '@/lib/services/operations-service';
import { operationsListContract } from './contract';

class OperationsUnavailableError extends Error {
  constructor() {
    super('Operations feed is temporarily unavailable');
  }
}

function requireOperationsEnabled(features: CommunityFeatures): void {
  if (!features.hasMaintenanceRequests || !features.hasWorkOrders) {
    throw new ForbiddenError('Operations are not enabled for this community type');
  }
}

const runOperationsList = runRoute(
  operationsListContract,
  async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    const features = getFeaturesForCommunity(membership.communityType);

    requireOperationsEnabled(features);
    if (membership.role === 'resident') {
      throw new ForbiddenError(
        'Residents cannot access the community operations summary',
      );
    }
    requirePermission(membership, 'maintenance', 'read');
    requirePermission(membership, 'work_orders', 'read');
    // Lapsed communities lose admin reads (residents unaffected — residents are
    // already rejected above; guard also short-circuits on isAdmin=false).
    await requireEntitledForAdminRead(communityId, membership);

    const payload = await listOperationsForCommunity(communityId, {
      cursor: query.cursor,
      limit: query.limit,
      type: query.type,
      status: query.status,
      priority: query.priority,
      unitId: query.unitId,
    });

    if (payload.meta.partialFailure && payload.data.length === 0) {
      throw new OperationsUnavailableError();
    }

    return payload;
  },
);

export const GET = withErrorHandler(async (req: NextRequest, ctx) => {
  try {
    return await runOperationsList(req, ctx);
  } catch (error) {
    if (error instanceof OperationsUnavailableError) {
      return NextResponse.json(
        {
          error: {
            code: 'OPERATIONS_UNAVAILABLE',
            message: 'Operations feed is temporarily unavailable',
          },
        },
        { status: 503 },
      );
    }
    throw error;
  }
});
