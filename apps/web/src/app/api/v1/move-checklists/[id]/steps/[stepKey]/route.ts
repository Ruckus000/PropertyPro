import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import { updateChecklistStep } from '@/lib/services/move-checklist-service';

const updateStepSchema = z.object({
  communityId: z.number().int().positive(),
  completed: z.boolean(),
  notes: z.string().max(2000).optional(),
  linkedEntityType: z.enum(['esign_submission', 'maintenance_request', 'invitation']).optional(),
  linkedEntityId: z.number().int().positive().optional(),
});

export const PATCH = withErrorHandler(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string; stepKey: string }> },
  ) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId, stepKey } = await params;
    const checklistId = Number(rawId);
    if (!Number.isInteger(checklistId) || checklistId <= 0) {
      throw new ValidationError('Invalid checklist ID');
    }

    const stepKeySchema = z.string().min(1).max(50).regex(/^[a-z_]+$/, 'Invalid step key format');
    const stepKeyResult = stepKeySchema.safeParse(stepKey);
    if (!stepKeyResult.success) {
      throw new ValidationError('Invalid step key', {
        fields: formatZodErrors(stepKeyResult.error),
      });
    }

    const body = await req.json();
    const parseResult = updateStepSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid step update', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const { communityId, ...stepInput } = parseResult.data;
    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await updateChecklistStep(
      communityId,
      checklistId,
      stepKey,
      stepInput,
      userId,
    );

    return NextResponse.json({ data: updated });
  },
);
