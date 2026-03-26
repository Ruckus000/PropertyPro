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
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import {
  createDeniedVisitor,
  listDeniedVisitors,
} from '@/lib/services/package-visitor-service';

const createDeniedSchema = z.object({
  communityId: z.number().int().positive(),
  fullName: z.string().min(1).max(240),
  reason: z.string().min(1).max(500),
  vehiclePlate: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsReadPermission(membership);
  requireStaffOperator(membership);

  const { searchParams } = new URL(req.url);
  const rawActive = searchParams.get('active');
  const onlyActive =
    rawActive === 'true' ? true : rawActive === 'false' ? false : undefined;

  const data = await listDeniedVisitors(communityId, onlyActive);

  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createDeniedSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid denied visitor payload', {
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
  const data = await createDeniedVisitor(communityId, actorUserId, {
    fullName: parsed.data.fullName,
    reason: parsed.data.reason,
    vehiclePlate: parsed.data.vehiclePlate ?? null,
    notes: parsed.data.notes ?? null,
  }, requestId);

  return NextResponse.json({ data }, { status: 201 });
});
