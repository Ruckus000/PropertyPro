import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient } from '@propertypro/db';
import type { ArcSubmissionStatus } from '@propertypro/db';
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
  requireArcEnabled,
  requireArcReadPermission,
  requireArcSubmitterRole,
  requireArcWritePermission,
} from '@/lib/violations/common';
import {
  createArcSubmissionForCommunity,
  listArcSubmissionsForCommunity,
} from '@/lib/services/violations-service';

const createArcSchema = z.object({
  communityId: z.number().int().positive(),
  unitId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  projectType: z.string().trim().min(1).max(120),
  estimatedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimatedCompletionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  attachmentDocumentIds: z.array(z.number().int().positive()).optional(),
});

const listArcStatusSchema = z.enum(['submitted', 'under_review', 'approved', 'denied', 'withdrawn']);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireArcEnabled(membership);
  requireArcReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawStatus = searchParams.get('status');
  const rawUnitId = searchParams.get('unitId');

  const parsedStatus = rawStatus ? listArcStatusSchema.safeParse(rawStatus) : null;
  if (rawStatus && !parsedStatus?.success) {
    throw new ValidationError('Invalid ARC status filter', {
      fields: [{ field: 'status', message: 'status must be one of submitted, under_review, approved, denied, withdrawn' }],
    });
  }

  const status = parsedStatus?.success ? (parsedStatus.data as ArcSubmissionStatus) : undefined;
  const unitId = rawUnitId ? parsePositiveInt(rawUnitId, 'unitId') : undefined;

  const scoped = createScopedClient(communityId);
  const residentUnitIds = isResidentRole(membership.role)
    ? await getActorUnitIds(scoped, actorUserId)
    : undefined;

  if (residentUnitIds && unitId !== undefined && !residentUnitIds.includes(unitId)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'You can only view ARC submissions for your own unit',
        },
      },
      { status: 403 },
    );
  }

  const data = await listArcSubmissionsForCommunity(communityId, {
    status,
    unitId,
    allowedUnitIds: residentUnitIds,
  });
  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = createArcSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid ARC submission payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireArcEnabled(membership);
  requireArcWritePermission(membership);
  requireArcSubmitterRole(membership);

  const scoped = createScopedClient(communityId);
  const unitIds = await getActorUnitIds(scoped, actorUserId);
  if (!unitIds.includes(parseResult.data.unitId)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Residents can only submit ARC applications for their own unit',
        },
      },
      { status: 403 },
    );
  }

  const requestId = req.headers.get('x-request-id');
  const data = await createArcSubmissionForCommunity(
    communityId,
    actorUserId,
    {
      unitId: parseResult.data.unitId,
      title: parseResult.data.title,
      description: parseResult.data.description,
      projectType: parseResult.data.projectType,
      estimatedStartDate: parseResult.data.estimatedStartDate ?? null,
      estimatedCompletionDate: parseResult.data.estimatedCompletionDate ?? null,
      attachmentDocumentIds: parseResult.data.attachmentDocumentIds,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
