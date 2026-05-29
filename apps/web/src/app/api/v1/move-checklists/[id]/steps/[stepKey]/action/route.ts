/**
 * POST /api/v1/move-checklists/[id]/steps/[stepKey]/action
 *
 * Admin-only integration actions on actionable move-checklist steps.
 *
 * Plan A1 drain #150. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { createElement } from 'react';
import { runRoute } from '@propertypro/api-contract';
import { isAdminRole } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import {
  createInspectionRequestForChecklist,
  getMoveChecklist,
  getResidentAndCommunityForWelcomeEmail,
  updateChecklistStep,
} from '@/lib/services/move-checklist-service';
import { createOnboardingInvitation } from '@/lib/services/onboarding-service';
import { getBaseUrl } from '@/lib/utils/url';
import { ACTIONABLE_STEPS } from '@propertypro/db';
import { WelcomeEmail, sendEmail } from '@propertypro/email';
import { moveChecklistStepActionPostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(moveChecklistStepActionPostContract, async ({ params, body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const checklistId = params.id;
    const { stepKey } = params;
    const { communityId, action } = body;

    const membership = await requireCommunityMembership(communityId, userId);
    if (!isAdminRole(membership.role)) {
      throw new ForbiddenError('Forbidden');
    }

    const checklist = await getMoveChecklist(communityId, checklistId);
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }

    const actionConfig = ACTIONABLE_STEPS[stepKey];
    if (!actionConfig || actionConfig.action !== action) {
      throw new ValidationError(`Action "${action}" not supported for step "${stepKey}"`);
    }

    switch (action) {
      case 'send_welcome': {
        const ctx = await getResidentAndCommunityForWelcomeEmail(
          communityId,
          checklist.residentId,
        );

        if (ctx) {
          const loginUrl = `${getBaseUrl()}/auth/login`;
          await sendEmail({
            to: ctx.resident.email,
            subject: `Welcome to ${ctx.community.name}`,
            category: 'transactional',
            react: createElement(WelcomeEmail, {
              branding: { communityName: ctx.community.name },
              primaryContactName: ctx.resident.fullName ?? 'Resident',
              communityName: ctx.community.name,
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

        return {
          data: updated,
          action: { triggered: action, stepKey },
        };
      }

      case 'send_invite': {
        const result = await createOnboardingInvitation({
          communityId,
          userId: checklist.residentId,
          actorUserId: userId,
          inviterName:
            req.headers.get('x-user-full-name') ||
            req.headers.get('x-user-email') ||
            'Your administrator',
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

        return {
          data: updated,
          action: { triggered: action, stepKey },
        };
      }

      case 'create_inspection': {
        const request = await createInspectionRequestForChecklist(communityId, {
          unitId: checklist.unitId,
          submittedById: userId,
          type: checklist.type,
        });
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
            linkedEntityId: request.id,
          },
          userId,
        );

        return {
          data: updated,
          action: { triggered: action, stepKey },
        };
      }
    }
  }),
);
