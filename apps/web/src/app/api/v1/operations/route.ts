import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getFeaturesForCommunity, type CommunityFeatures } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requirePermission } from '@/lib/db/access-control';
import { listOperationsForCommunity } from '@/lib/services/operations-service';

const operationsQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  type: z.enum(['maintenance_request', 'work_order']).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  priority: z.string().trim().min(1).max(32).optional(),
  unitId: z.coerce.number().int().positive().optional(),
});

function requireOperationsEnabled(features: CommunityFeatures): void {
  if (!features.hasMaintenanceRequests || !features.hasWorkOrders) {
    throw new ForbiddenError('Operations are not enabled for this community type');
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  const features = getFeaturesForCommunity(membership.communityType);

  requireOperationsEnabled(features);
  requirePermission(membership, 'maintenance', 'read');
  requirePermission(membership, 'work_orders', 'read');

  const searchParams = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = operationsQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    throw new ValidationError('Invalid operations query', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const data = await listOperationsForCommunity(communityId, {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
    type: parsed.data.type,
    status: parsed.data.status,
    priority: parsed.data.priority,
    unitId: parsed.data.unitId,
  });

  if (data.meta.partialFailure && data.data.length === 0) {
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

  return NextResponse.json({ data });
});
