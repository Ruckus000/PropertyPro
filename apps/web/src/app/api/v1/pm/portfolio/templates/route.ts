/**
 * Portfolio-template library routes — GET/POST/PATCH/DELETE
 * `/api/v1/pm/portfolio/templates` (PT-PR4).
 *
 * Every method runs the shared `gateUser()`:
 *   requireAuthenticatedUserId
 *     → isPmAdminInAnyCommunity (pm_admin in ≥1 community)
 *     → userHasPortfolioTemplatesAccess (hasSitePortfolioTemplates plan feature)
 * POST additionally authorizes the caller manages the SOURCE community
 * (requireCommunityMembership + pm_admin/cam) before snapshotting its branding.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import { AppError, ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import * as svc from '@/lib/services/site-portfolio-template-service';
import {
  templatesListContract,
  templateCreateContract,
  templateRenameContract,
  templateDeleteContract,
} from './contract';

/** PM + plan-feature gate shared by all four methods. Returns the actor's userId. */
async function gateUser(): Promise<string> {
  const userId = await requireAuthenticatedUserId();
  if (!(await isPmAdminInAnyCommunity(userId))) {
    throw new ForbiddenError('Only property managers can manage portfolio templates');
  }
  if (!(await svc.userHasPortfolioTemplatesAccess(userId))) {
    throw new AppError(
      'Portfolio templates require the Operations Plus plan.',
      403,
      'PLAN_UPGRADE_REQUIRED',
    );
  }
  return userId;
}

export const GET = withErrorHandler(
  runRoute(templatesListContract, async () => {
    const userId = await gateUser();
    return { templates: await svc.listTemplates(userId) };
  }),
);

export const POST = withErrorHandler(
  runRoute(templateCreateContract, async ({ body }) => {
    const userId = await gateUser();
    // Authorize the caller manages the SOURCE community before capturing it.
    const membership = await requireCommunityMembership(body.communityId, userId);
    requireRole(membership, PM_MANAGER_ROLES, 'You do not manage that community');
    return svc.createFromCommunity(userId, body.communityId, body.name);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(templateRenameContract, async ({ body }) => {
    const userId = await gateUser();
    return svc.renameTemplate(userId, body.id, body.name);
  }),
);

export const DELETE = withErrorHandler(
  runRoute(templateDeleteContract, async ({ body }) => {
    const userId = await gateUser();
    await svc.deleteTemplate(userId, body.id);
    return { ok: true as const };
  }),
);
