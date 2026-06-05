/**
 * Bulk-apply a portfolio template — POST `/api/v1/pm/portfolio/templates/[id]/apply` (PT-PR5).
 *
 * Same PM + plan-feature gate as the templates CRUD routes. Applies the
 * template's branding to the chosen managed communities; per-community results.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import * as svc from '@/lib/services/site-portfolio-template-service';
import { templateApplyContract } from './contract';

/** PM + plan-feature gate (mirrors the templates CRUD route). Returns the actor's userId. */
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

export const POST = withErrorHandler(
  runRoute(templateApplyContract, async ({ params, body }) => {
    const userId = await gateUser();
    return svc.applyTemplate(userId, params.id, body.communityIds);
  }),
);
