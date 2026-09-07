/**
 * GET /api/v1/pm/dashboard/summary
 *
 * Cross-community portfolio dashboard for property managers. Aggregates
 * KPIs (units, occupancy, maintenance, compliance, delinquency, expiring
 * leases) plus per-community summary rows across ALL communities where the
 * caller holds a management role. Only callable by users holding
 * property_manager or root_manager in at least one non-deleted community.
 *
 * Plan A1 drain #12 — combines drain #6's PM-only session-anchored auth
 * pattern (`isPmAdminInAnyCommunity`) with drain #2's rich query schema
 * (filter / sort / pagination). Cross-community aggregation route — no
 * tenant context, no audit log.
 *
 * Auth chain — the first three steps now live inside
 * `requirePmPortfolioAccess`, which this handler calls, so they no longer
 * appear in this file:
 *   requirePmPortfolioAccess
 *     → requireAuthenticatedUserId
 *     → isPmAdminInAnyCommunity(userId)   (inArray over PM_SCOPE_DB_ROLES)
 *     → throw ForbiddenError if !isPm
 *   → getPortfolioDashboard(userId, query)
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
import { getPortfolioDashboard } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePmPortfolioAccess } from '@/lib/api/pm-portfolio-access';
import { pmDashboardSummaryContract } from './contract';

export const GET = withErrorHandler(
  runRoute(pmDashboardSummaryContract, async ({ query }) => {
    const userId = await requirePmPortfolioAccess();

    return await getPortfolioDashboard(userId, query);
  }),
);
