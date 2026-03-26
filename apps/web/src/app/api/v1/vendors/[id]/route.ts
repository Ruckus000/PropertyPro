import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireWorkOrderAdminWrite,
  requireWorkOrdersEnabled,
  requireWorkOrdersWritePermission,
} from '@/lib/work-orders/common';
import { updateVendorForCommunity } from '@/lib/services/work-orders-service';

const updateVendorSchema = z.object({
  communityId: z.number().int().positive(),
  name: z.string().trim().min(1).max(240).optional(),
  company: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  specialties: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const vendorId = parsePositiveInt(params?.id ?? '', 'vendor id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = updateVendorSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid vendor update payload', {
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
    const data = await updateVendorForCommunity(
      communityId,
      vendorId,
      actorUserId,
      {
        name: parsed.data.name,
        company: parsed.data.company,
        phone: parsed.data.phone,
        email: parsed.data.email,
        specialties: parsed.data.specialties,
        isActive: parsed.data.isActive,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);
