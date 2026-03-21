import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, type PackageLogStatus } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError, ForbiddenError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  isResidentRole,
  requireActorUnitIds,
  requirePackageLoggingEnabled,
  requirePackagesReadPermission,
  requirePackagesWritePermission,
  requireStaffOperator,
} from '@/lib/logistics/common';
import {
  createPackageForCommunity,
  listPackagesForCommunity,
} from '@/lib/services/package-visitor-service';

const createPackageSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  recipientName: z.string().trim().min(1).max(240),
  carrier: z.string().trim().min(1).max(120),
  trackingNumber: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const packageStatusSchema = z.enum(['received', 'notified', 'picked_up']);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requirePackageLoggingEnabled(membership);
  requirePackagesReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');
  const rawUnitId = searchParams.get('unitId');

  const statusParsed = rawStatus ? packageStatusSchema.safeParse(rawStatus) : null;
  if (rawStatus && !statusParsed?.success) {
    throw new ValidationError('Invalid package status filter', {
      fields: [{
        field: 'status',
        message: 'status must be one of received, notified, picked_up',
      }],
    });
  }

  const unitId = rawUnitId ? parsePositiveInt(rawUnitId, 'unitId') : undefined;
  const status = statusParsed?.success
    ? (statusParsed.data as PackageLogStatus)
    : undefined;

  let allowedUnitIds: number[] | undefined;
  if (isResidentRole(membership.role)) {
    const scoped = createScopedClient(communityId);
    allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

    if (unitId !== undefined && !allowedUnitIds.includes(unitId)) {
      throw new ForbiddenError('You can only view packages for your own unit');
    }
  }

  const data = await listPackagesForCommunity(communityId, {
    unitId,
    status,
    allowedUnitIds,
  });

  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createPackageSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid package payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requirePackageLoggingEnabled(membership);
  requirePackagesWritePermission(membership);
  requireStaffOperator(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await createPackageForCommunity(
    communityId,
    actorUserId,
    {
      unitId: parsed.data.unitId,
      recipientName: parsed.data.recipientName,
      carrier: parsed.data.carrier,
      trackingNumber: parsed.data.trackingNumber ?? null,
      notes: parsed.data.notes ?? null,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
