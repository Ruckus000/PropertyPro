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
import { createAmenityForCommunity, paginateAmenitiesForCommunity } from '@/lib/services/work-orders-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

const listAmenitiesQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

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
  await requirePlanFeature(communityId, 'hasAmenities');
  requireAmenitiesReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const parsedQuery = listAmenitiesQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });

  if (!parsedQuery.success) {
    throw new ValidationError('Invalid amenities query', {
      fields: formatZodErrors(parsedQuery.error),
    });
  }

  const result = await paginateAmenitiesForCommunity(communityId, {
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
  });
  return NextResponse.json({
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
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
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAmenitiesEnabled(membership);
  await requirePlanFeature(communityId, 'hasAmenities');
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

  return NextResponse.json({ data });
});
