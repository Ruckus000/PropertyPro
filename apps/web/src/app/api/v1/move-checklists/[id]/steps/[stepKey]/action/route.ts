import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createElement } from 'react';
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
import { createOnboardingInvitation } from '@/lib/services/onboarding-service';
import { getBaseUrl } from '@/lib/utils/url';
import { ACTIONABLE_STEPS, createScopedClient, users, communities, maintenanceRequests } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { WelcomeEmail, sendEmail } from '@propertypro/email';

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
    const scoped = createScopedClient(communityId);

    switch (action) {
      case 'send_welcome': {
        // Load resident and community for the welcome email
        const [userRows, communityRows] = await Promise.all([
          scoped.selectFrom(users, {}, eq(users.id, checklist.residentId)),
          scoped.selectFrom(communities, {}, eq(communities.id, communityId)),
        ]);
        const resident = userRows[0];
        const community = communityRows[0];

        if (resident && community) {
          const loginUrl = `${getBaseUrl()}/auth/login`;
          await sendEmail({
            to: (resident as Record<string, unknown>).email as string,
            subject: `Welcome to ${(community as Record<string, unknown>).name as string}`,
            category: 'transactional',
            react: createElement(WelcomeEmail, {
              branding: { communityName: (community as Record<string, unknown>).name as string },
              primaryContactName: ((resident as Record<string, unknown>).fullName as string) ?? 'Resident',
              communityName: (community as Record<string, unknown>).name as string,
              loginUrl,
            }),
          });
        }

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

      case 'send_invite': {
        // Reuse the onboarding invitation flow
        const result = await createOnboardingInvitation({
          communityId,
          userId: checklist.residentId,
          actorUserId: userId,
          inviterName: req.headers.get('x-user-full-name') || req.headers.get('x-user-email') || 'Your administrator',
        });

        const updated = await updateChecklistStep(
          communityId,
          checklistId,
          stepKey,
          {
            completed: true,
            linkedEntityType: 'invitation',
            linkedEntityId: result.id,
          },
          userId,
        );

        return NextResponse.json({
          data: updated,
          action: { triggered: action, stepKey },
        });
      }

      case 'create_inspection': {
        // Create a maintenance request of category 'inspection'
        const title = checklist.type === 'move_in'
          ? 'Move-In Inspection'
          : 'Move-Out Inspection';

        const rows = await scoped.insert(maintenanceRequests, {
          communityId,
          unitId: checklist.unitId,
          submittedById: userId,
          title,
          description: `Scheduled ${title.toLowerCase()} for unit.`,
          category: 'inspection',
          priority: 'normal',
          status: 'open',
        });

        const request = rows[0];
        if (!request) {
          throw new Error('Failed to create inspection request');
        }

        const updated = await updateChecklistStep(
          communityId,
          checklistId,
          stepKey,
          {
            completed: true,
            linkedEntityType: 'maintenance_request',
            linkedEntityId: (request as Record<string, unknown>).id as number,
          },
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
