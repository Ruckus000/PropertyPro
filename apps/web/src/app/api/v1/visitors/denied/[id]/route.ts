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
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import {
  updateDeniedVisitor,
  softDeleteDeniedVisitor,
} from '@/lib/services/package-visitor-service';

const updateDeniedSchema = z.object({
  communityId: z.number().int().positive(),
  fullName: z.string().min(1).max(240).optional(),
  reason: z.string().min(1).max(500).optional(),
  vehiclePlate: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const deleteDeniedSchema = z.object({
  communityId: z.number().int().positive(),
});

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const deniedId = parsePositiveInt(params?.id ?? '', 'denied visitor id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = updateDeniedSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid denied visitor update payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);
    requireStaffOperator(membership);

    const requestId = req.headers.get('x-request-id');
    const { communityId: _, ...input } = parsed.data;
    const data = await updateDeniedVisitor(communityId, deniedId, actorUserId, input, requestId);

    return NextResponse.json({ data });
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const deniedId = parsePositiveInt(params?.id ?? '', 'denied visitor id');

    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = deleteDeniedSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid denied visitor delete payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);
    requireStaffOperator(membership);

    const requestId = req.headers.get('x-request-id');
    await softDeleteDeniedVisitor(communityId, deniedId, actorUserId, requestId);

    return NextResponse.json({ data: { success: true } });
  },
);
