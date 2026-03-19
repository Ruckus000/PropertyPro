import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { isAdminRole } from '@propertypro/shared';
import {
  getMoveChecklist,
  updateChecklistStep,
} from '@/lib/services/move-checklist-service';
import { ACTIONABLE_STEPS } from '@propertypro/db';

const actionSchema = z.object({
  communityId: z.number().int().positive(),
  action: z.enum(['create_inspection', 'send_invite', 'send_welcome']),
});

export const POST = withErrorHandler(
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

    const body = await req.json();
    const parseResult = actionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid action', {
        fields: formatZodErrors(parseResult.error),
      });
    }

    const { communityId, action } = parseResult.data;
    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const checklist = await getMoveChecklist(communityId, checklistId);
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }

    const actionConfig = ACTIONABLE_STEPS[stepKey];
    if (!actionConfig || actionConfig.action !== action) {
      throw new ValidationError(`Action "${action}" not supported for step "${stepKey}"`);
    }

    // Dispatch integration action
    switch (action) {
      case 'create_inspection':
      case 'send_invite': {
        // These integrations are not yet wired — return without modifying the step
        // to avoid writing a dangling linkedEntityType with no linkedEntityId.
        return NextResponse.json({
          data: checklist,
          action: {
            triggered: action,
            status: 'not_implemented',
            message: 'Integration pending \u2014 step not modified',
          },
        });
      }
      case 'send_welcome': {
        // TODO: Wire to email service to send welcome packet
        // Auto-complete the step on send
        const updated = await updateChecklistStep(
          communityId,
          checklistId,
          stepKey,
          { completed: true },
          userId,
        );

        return NextResponse.json({
          data: updated,
          action: { triggered: action, stepKey },
        });
      }
    }
  },
);
