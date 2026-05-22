/**
 * Route contract for `GET /api/v1/pm/dashboard/summary`.
 *
 * Plan A1 drain #12 — combines drain #6's PM-only session-anchored auth
 * (`isPmAdminInAnyCommunity`) with drain #2's rich query schema
 * (filter / sort / pagination). The actor IS the anchor — no `communityId`
 * is required because this endpoint aggregates KPIs and per-community rows
 * across ALL communities where the user is a PM admin. There is no tenant
 * context (cross-community aggregation).
 *
 * Authorization: session-anchored — the user is the anchor. The "PM in at
 * least one community" gate (`isPmAdminInAnyCommunity`) is enforced inside
 * the route handler in `./route.ts` (same pattern as drain #6). The
 * contract is metadata only and does not gate the call.
 *
 * NOTE on permission: `{ resource: 'settings', action: 'read' }` is a
 * placeholder — `RBAC_RESOURCES` has no "portfolio" / "dashboard" / "pm"
 * resource, and this endpoint isn't gated by the RBAC matrix anyway (the
 * PM gate is the authoritative check). `settings` is the closest semantic
 * match and matches the precedent set by drains #1 / #6 / #8 for
 * session-anchored, cross-community endpoints. The contract runner does
 * NOT enforce `permission` today (Plan A1 foundation; metadata only).
 *
 * NOTE on response shape: declared as `z.unknown()`. Same loose-aggregate
 * philosophy as drain #8 (`/api/v1/overview`):
 *   1. `PortfolioDashboardResult` is a deeply nested aggregate
 *      (`{ kpis: DashboardKpis, communities: DashboardCommunityRow[],
 *      totalCount: number }`) where each sub-shape can evolve additively as
 *      new KPIs / per-community fields land.
 *   2. The consumer hook (`use-portfolio-dashboard.ts`) already has its own
 *      `RawDashboardResponse` interface that pins the wire shape on the
 *      client side — the TypeScript type is the source of truth for the UI.
 *   3. Tightening to per-field `z.object({...})` schemas would risk 500s on
 *      benign additive field changes in the underlying `getPortfolioDashboard`
 *      query (new KPI fields are exactly the kind of change this endpoint is
 *      expected to accept additively).
 * The `contract_violation: response` Sentry canary still fires on
 * structural breakage (the runner stringifies a `z.unknown()`-validated
 * payload identically to the prior `NextResponse.json({ data: result })`).
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { COMMUNITY_TYPES } from '@propertypro/shared';

/**
 * Query shape — preserved byte-identical to the pre-migration
 * `querySchema` in the route file. All fields optional; the underlying
 * `getPortfolioDashboard` service treats omitted filters as "no filter".
 *
 *   - `communityType`: filter to a single community type
 *   - `search`: case-insensitive substring match on community name
 *   - `sortBy`: one of 6 columns; service applies a stable secondary
 *     order on `communityId` internally
 *   - `sortDir`: ascending / descending
 *   - `limit`: page size, clamped 1..100
 *   - `offset`: standard offset pagination; service does NOT use cursor
 *     pagination here (cross-community aggregate; row order is recomputed
 *     per request)
 */
export const pmDashboardSummaryQuerySchema = z.object({
  communityType: z.enum(COMMUNITY_TYPES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sortBy: z
    .enum([
      'communityName',
      'totalUnits',
      'residentCount',
      'openMaintenanceRequests',
      'occupancyRate',
      'outstandingBalanceCents',
    ])
    .optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type PmDashboardSummaryQuery = z.infer<typeof pmDashboardSummaryQuerySchema>;

export const pmDashboardSummaryContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/dashboard/summary',
  request: {
    query: pmDashboardSummaryQuerySchema,
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
});
