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
  requireAmenityAdminWrite,
  requireAmenitiesEnabled,
  requireAmenitiesWritePermission,
} from '@/lib/work-orders/common';
import { updateAmenityForCommunity } from '@/lib/services/work-orders-service';

const bookingRulesSchema = z.object({
  minDurationMinutes: z.number().int().positive().optional(),
  maxDurationMinutes: z.number().int().positive().optional(),
  advanceBookingDays: z.number().int().positive().optional(),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

const updateAmenitySchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  location: z.string().trim().max(240).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  isBookable: z.boolean().optional(),
  bookingRules: bookingRulesSchema.optional(),
});

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const amenityId = parsePositiveInt(params?.id ?? '', 'amenity id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = updateAmenitySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid amenity update payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    requireAmenitiesEnabled(membership);
    requireAmenitiesWritePermission(membership);
    requireAmenityAdminWrite(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await updateAmenityForCommunity(
      communityId,
      amenityId,
      actorUserId,
      {
        name: parsed.data.name,
        description: parsed.data.description,
        location: parsed.data.location,
        capacity: parsed.data.capacity,
        isBookable: parsed.data.isBookable,
        bookingRules: parsed.data.bookingRules,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);
