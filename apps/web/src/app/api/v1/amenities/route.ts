import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireAmenityAdminWrite,
  requireAmenitiesEnabled,
  requireAmenitiesReadPermission,
  requireAmenitiesWritePermission,
} from '@/lib/work-orders/common';
import { createAmenityForCommunity, listAmenitiesForCommunity } from '@/lib/services/work-orders-service';

const bookingRulesSchema = z.object({
  minDurationMinutes: z.number().int().positive().optional(),
  maxDurationMinutes: z.number().int().positive().optional(),
  advanceBookingDays: z.number().int().positive().optional(),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

const createAmenitySchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).nullable().optional(),
  location: z.string().trim().max(240).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  isBookable: z.boolean().optional(),
  bookingRules: bookingRulesSchema.optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAmenitiesEnabled(membership);
  requireAmenitiesReadPermission(membership);

  const data = await listAmenitiesForCommunity(communityId);
  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createAmenitySchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid amenity payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAmenitiesEnabled(membership);
  requireAmenitiesWritePermission(membership);
  requireAmenityAdminWrite(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await createAmenityForCommunity(
    communityId,
    actorUserId,
    {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      location: parsed.data.location ?? null,
      capacity: parsed.data.capacity ?? null,
      isBookable: parsed.data.isBookable,
      bookingRules: parsed.data.bookingRules,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
