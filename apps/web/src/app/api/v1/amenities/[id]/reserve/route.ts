import { NextResponse, type NextRequest } from 'next/server';
import { createScopedClient } from '@propertypro/db';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  getActorUnitIds,
  isResidentRole,
  requireActorUnitId,
  requireAmenitiesEnabled,
  requireAmenitiesWritePermission,
  requireReservationPermission,
} from '@/lib/work-orders/common';
import { createReservationForCommunity } from '@/lib/services/work-orders-service';

const reserveAmenitySchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive().nullable().optional(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const amenityId = parsePositiveInt(params?.id ?? '', 'amenity id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = reserveAmenitySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid reservation payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    requireAmenitiesWritePermission(membership);
    requireReservationPermission(membership);

    const scoped = createScopedClient(communityId);
    let resolvedUnitId: number | null = parsed.data.unitId ?? null;

    if (isResidentRole(membership.role)) {
      const actorUnitIds = await getActorUnitIds(scoped, actorUserId);
      if (resolvedUnitId === null) {
        resolvedUnitId = await requireActorUnitId(scoped, actorUserId);
      }
      if (!actorUnitIds.includes(resolvedUnitId)) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Residents can only reserve amenities for their own unit',
            },
          },
          { status: 403 },
        );
      }
    }

    const requestId = req.headers.get('x-request-id');
    const data = await createReservationForCommunity(
      communityId,
      actorUserId,
      {
        amenityId,
        unitId: resolvedUnitId,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        notes: parsed.data.notes ?? null,
      },
      requestId,
    );

    return NextResponse.json({ data }, { status: 201 });
  },
);
