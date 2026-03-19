import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import { getMoveChecklist, completeChecklist } from '@/lib/services/move-checklist-service';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId } = await params;
    const checklistId = Number(rawId);
    if (!Number.isInteger(checklistId) || checklistId <= 0) {
      throw new ValidationError('Invalid checklist ID');
    }

    const { searchParams } = new URL(req.url);
    const communityId = Number(searchParams.get('communityId'));
    if (!Number.isInteger(communityId) || communityId <= 0) {
      throw new ValidationError('communityId query param required');
    }

    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    const checklist = await getMoveChecklist(communityId, checklistId);
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }

    return NextResponse.json({ data: checklist });
  },
);

// ---------------------------------------------------------------------------
// POST — Complete a checklist (all steps must be done)
// ---------------------------------------------------------------------------

const completeChecklistSchema = z.object({
  communityId: z.number().int().positive('Community ID must be a positive integer'),
});

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId } = await params;
    const checklistId = Number(rawId);
    if (!Number.isInteger(checklistId) || checklistId <= 0) {
      throw new ValidationError('Invalid checklist ID');
    }

    const body: unknown = await req.json();
    const parseResult = completeChecklistSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid request', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const { communityId } = parseResult.data;
    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    const completed = await completeChecklist(communityId, checklistId, userId);
    return NextResponse.json({ data: completed });
  },
);
