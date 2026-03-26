import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  requireWorkOrderAdminWrite,
  requireWorkOrdersEnabled,
  requireWorkOrdersReadPermission,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import { createVendorForCommunity, listVendorsForCommunity } from '@/lib/services/work-orders-service';

const createVendorSchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(240),
  company: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  specialties: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  isActive: z.boolean().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireWorkOrdersEnabled(membership);
  requireWorkOrdersReadPermission(membership);

  const data = await listVendorsForCommunity(communityId);
  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createVendorSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid vendor payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireWorkOrdersEnabled(membership);
  requireWorkOrdersWritePermission(membership);
  requireWorkOrderAdminWrite(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await createVendorForCommunity(
    communityId,
    actorUserId,
    {
      name: parsed.data.name,
      company: parsed.data.company ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      specialties: parsed.data.specialties,
      isActive: parsed.data.isActive,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
