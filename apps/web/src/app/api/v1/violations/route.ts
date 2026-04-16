import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, units, userRoles } from '@propertypro/db';
import type { ViolationSeverity, ViolationStatus } from '@propertypro/db';
import { eq, inArray } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
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

  const reporterIds = Array.from(
    new Set(
      data
        .map((v) => v.reportedByUserId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );
  const roleByUser = new Map<string, 'resident' | 'staff'>();
  if (reporterIds.length > 0) {
    const reporterRoles = await scoped.selectFrom<{ userId: string; role: string }>(
      userRoles,
      { userId: userRoles.userId, role: userRoles.role },
      inArray(userRoles.userId, reporterIds),
    );
    for (const r of reporterRoles) {
      roleByUser.set(r.userId, r.role === 'resident' ? 'resident' : 'staff');
    }
  }

  const hydrated = data.map((v) => ({
    ...v,
    reportedByRole: v.reportedByUserId ? (roleByUser.get(v.reportedByUserId) ?? null) : null,
  }));

  return NextResponse.json({ data: hydrated });
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
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireViolationsEnabled(membership);
  requireViolationsWritePermission(membership);

  const scoped = createScopedClient(communityId);
  if (isResidentRole(membership.role)) {
    const unitIds = await getActorUnitIds(scoped, actorUserId);
    if (unitIds.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You must be associated with a unit before reporting a violation',
          },
        },
        { status: 403 },
      );
    }
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
  } else {
    // Staff path: validate target unit belongs to this scoped community.
    // createScopedClient injects community_id + deletedAt IS NULL, so a unitId
    // from another tenant returns zero rows here and surfaces as NotFound.
    const matches = await scoped.selectFrom<{ id: number }>(
      units,
      { id: units.id },
      eq(units.id, parseResult.data.unitId),
    );
    if (matches.length === 0) {
      throw new NotFoundError(`Unit ${parseResult.data.unitId} not found in this community`);
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
