/**
 * GET /api/v1/pm/dashboard/summary
 *
 * Cross-community portfolio dashboard for property managers. Aggregates
 * KPIs (units, occupancy, maintenance, compliance, delinquency, expiring
 * leases) plus per-community summary rows across ALL communities where the
 * caller is a PM admin. Only callable by users who are pm_admin in at
 * least one community.
 *
 * Plan A1 drain #12 — combines drain #6's PM-only session-anchored auth
 * pattern (`isPmAdminInAnyCommunity`) with drain #2's rich query schema
 * (filter / sort / pagination). Cross-community aggregation route — no
 * tenant context, no audit log.
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → isPmAdminInAnyCommunity(userId)
 *     → throw ForbiddenError if !isPm
 *     → getPortfolioDashboard(userId, query)
 *
 * The literal ForbiddenError message
 * (`'This endpoint is only available to property managers'`) is preserved
 * — same as drain #6.
 *
 * Behavior changes:
 *   - 400 body shape becomes the canonical `VALIDATION_ERROR` envelope with
 *     per-field detail (was a hand-constructed `ValidationError` carrying
 *     `formatZodErrors(parseResult.error)`). Status unchanged (400).
 *   - The wire response shape is unchanged: `{ data: <result> }`.
 *
 * The consumer hook `usePortfolioDashboard` reads `json.data` after an
 * `res.ok` check and surfaces `json.error?.message` on failure — both
 * branches are stable across the envelope change. No consumer changes
 * required.
 */
import { runRoute } from '@propertypro/api-contract';
// AUTHZ: Phase 2C: PM dashboard — cross-community KPI aggregation + report queries
import { isPmAdminInAnyCommunity, getPortfolioDashboard } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { pmDashboardSummaryContract } from './contract';

export const GET = withErrorHandler(
  runRoute(pmDashboardSummaryContract, async ({ query }) => {
    const userId = await requireAuthenticatedUserId();

    const isPm = await isPmAdminInAnyCommunity(userId);
    if (!isPm) {
      throw new ForbiddenError('This endpoint is only available to property managers');
    }

    return await getPortfolioDashboard(userId, query);
  }),
);
