import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient } from '@propertypro/db';
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
  requireViolationAdminWrite,
  requireViolationsEnabled,
  requireViolationsReadPermission,
  requireViolationsWritePermission,
} from '@/lib/violations/common';
import { getViolationForCommunity, updateViolationForCommunity } from '@/lib/services/violations-service';

const updateViolationSchema = z.object({
  communityId: z.number().int().positive(),
  category: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  severity: z.enum(['minor', 'moderate', 'major']).optional(),
  status: z.enum(['reported', 'noticed', 'hearing_scheduled', 'fined', 'resolved', 'dismissed']).optional(),
  evidenceDocumentIds: z.array(z.number().int().positive()).optional(),
  noticeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  hearingDate: z.string().datetime().nullable().optional(),
  resolutionNotes: z.string().max(4000).nullable().optional(),
});

export const GET = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'violation id');
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requireViolationsReadPermission(membership);

    const scoped = createScopedClient(communityId);
    const residentUnitIds = isResidentRole(membership.role)
      ? await getActorUnitIds(scoped, actorUserId)
      : undefined;

    const data = await getViolationForCommunity(communityId, id, residentUnitIds);
    return NextResponse.json({ data });
  },
);

export const PATCH = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const id = parsePositiveInt(params?.id ?? '', 'violation id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parseResult = updateViolationSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError('Invalid violation update payload', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireViolationsEnabled(membership);
    requireViolationsWritePermission(membership);
    requireViolationAdminWrite(membership);

    const requestId = req.headers.get('x-request-id');
    const data = await updateViolationForCommunity(
      communityId,
      id,
      actorUserId,
      {
        category: parseResult.data.category,
        description: parseResult.data.description,
        severity: parseResult.data.severity,
        status: parseResult.data.status,
        evidenceDocumentIds: parseResult.data.evidenceDocumentIds,
        noticeDate: parseResult.data.noticeDate,
        hearingDate: parseResult.data.hearingDate,
        resolutionNotes: parseResult.data.resolutionNotes,
      },
      requestId,
    );

    return NextResponse.json({ data });
  },
);
