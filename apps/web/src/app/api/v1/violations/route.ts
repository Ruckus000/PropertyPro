import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient } from '@propertypro/db';
import type { ViolationSeverity, ViolationStatus } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  getActorUnitIds,
  isResidentRole,
  requireViolationsEnabled,
  requireViolationsReadPermission,
  requireViolationsWritePermission,
} from '@/lib/violations/common';
import {
  createViolationForCommunity,
  listViolationsForCommunity,
} from '@/lib/services/violations-service';

const createViolationSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  category: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  severity: z.enum(['minor', 'moderate', 'major']).optional(),
  evidenceDocumentIds: z.array(z.number().int().positive()).optional(),
});

const listStatusSchema = z.enum([
  'reported',
  'noticed',
  'hearing_scheduled',
  'fined',
  'resolved',
  'dismissed',
]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireViolationsEnabled(membership);
  requireViolationsReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawUnitId = searchParams.get('unitId');
  const rawStatus = searchParams.get('status');
  const createdAfter = searchParams.get('createdAfter') ?? undefined;
  const createdBefore = searchParams.get('createdBefore') ?? undefined;

  const unitId = rawUnitId ? parsePositiveInt(rawUnitId, 'unitId') : undefined;
  const status = rawStatus
    ? (listStatusSchema.parse(rawStatus) as ViolationStatus)
    : undefined;

  const scoped = createScopedClient(communityId);
  const residentUnitIds = isResidentRole(membership.role)
    ? await getActorUnitIds(scoped, actorUserId)
    : undefined;

  if (residentUnitIds && unitId !== undefined && !residentUnitIds.includes(unitId)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'You can only view violations for your own unit',
        },
      },
      { status: 403 },
    );
  }

  const data = await listViolationsForCommunity(communityId, {
    status,
    unitId,
    allowedUnitIds: residentUnitIds,
    createdAfter,
    createdBefore,
  });

  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createViolationSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid violation payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireViolationsEnabled(membership);
  requireViolationsWritePermission(membership);

  const scoped = createScopedClient(communityId);
  if (isResidentRole(membership.role)) {
    const unitIds = await getActorUnitIds(scoped, actorUserId);
    if (!unitIds.includes(parseResult.data.unitId)) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Residents can only report violations for their own unit',
          },
        },
        { status: 403 },
      );
    }
  }

  const requestId = req.headers.get('x-request-id');
  const data = await createViolationForCommunity(
    communityId,
    actorUserId,
    {
      unitId: parseResult.data.unitId,
      category: parseResult.data.category,
      description: parseResult.data.description,
      severity: parseResult.data.severity as ViolationSeverity | undefined,
      evidenceDocumentIds: parseResult.data.evidenceDocumentIds,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
