import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  isResidentRole,
  requireAmenitiesEnabled,
  requireAmenitiesWritePermission,
  requireReservationPermission,
} from '@/lib/work-orders/common';
import { cancelReservationForCommunity } from '@/lib/services/work-orders-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

const cancelReservationSchema = z.object({
  communityId: z.number().int().positive(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const reservationId = parsePositiveInt(params?.id ?? '', 'reservation id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = cancelReservationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid reservation cancel payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    requireAmenitiesWritePermission(membership);
    requireReservationPermission(membership);

    const canCancelAny = !isResidentRole(membership.role);
    const requestId = req.headers.get('x-request-id');
    const data = await cancelReservationForCommunity(
      communityId,
      reservationId,
      actorUserId,
      canCancelAny,
      requestId,
    );

    return NextResponse.json({ data });
  },
);
