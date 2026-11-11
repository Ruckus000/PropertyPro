/**
 * The Communities page summary: every managed community with a status the
 * page can group and sort by, plus the counts the page needs to pick its
 * layout (the unfiltered total) and label its saved views.
 *
 * Status is measured, never assumed:
 * - "needs_attention": a required document is past its posting deadline, or
 *   (where the plan includes finance) there are overdue dues.
 * - "on_track": something is measured and nothing above applies.
 * - "not_tracked": nothing is measured. Apartments have no posting rules and
 *   rent is not counted here, so they always land here; so does a condo or HOA
 *   with no applicable checklist items and no finance on its plan.
 *
 * Open maintenance requests are reported as a number and never decide status:
 * requests have no due date, so "overdue" has no meaning for them yet.
 */
import {
  getEffectiveFeatures,
  isValidHexColor,
  liveLook,
  postingClockApplies,
  resolvePlanId,
  type CommunityBranding,
  type CommunityType,
} from '@propertypro/shared';
// Every caller passes the actor's own user id, and the community ids handed to
// findPortfolioStatusInputsUnscoped come only from getPortfolioDashboard's rows
// (the actor's managed set), so these reads never reach outside it.
// AUTHZ: PM portfolio — cross-community reads, gated by requirePmPortfolioAccess in the route
import {
  findPortfolioStatusInputsUnscoped,
  getPortfolioDashboard,
  type DashboardCommunityRow,
  type DashboardKpis,
  type PortfolioStatusInputs,
} from '@propertypro/db/unsafe';
import { withDerivedStatus } from '@/lib/compliance/derive-checklist-status';
import {
  PORTFOLIO_SORT_KEYS,
  PORTFOLIO_VIEWS,
  type PortfolioSortKey,
  type PortfolioView,
} from './portfolio-summary-keys';

export type PortfolioStatus = 'needs_attention' | 'on_track' | 'not_tracked';

export { PORTFOLIO_SORT_KEYS, PORTFOLIO_VIEWS };
export type { PortfolioSortKey, PortfolioView };

export interface PortfolioCommunitySummary extends DashboardCommunityRow {
  /** Satisfied ÷ applicable checklist items, as the Compliance page counts them. Null when nothing applies (and always for apartments). */
  complianceScore: number | null;
  /** Checklist items past their posting deadline. Null for apartments. Always 0 below the website rule's size threshold, where no posting clock runs. */
  pastDeadlineCount: number | null;
  /** Overdue assessment dues. Null when the plan does not include finance, or for apartments (rent is not counted here). */
  overdueDuesCents: number | null;
  status: PortfolioStatus;
  /** The live look's primary colour, for the site thumbnail. Null when unset or not a valid hex colour. */
  brandColor: string | null;
}

export interface PortfolioSummaryQuery {
  communityType?: CommunityType;
  search?: string;
  view?: PortfolioView;
  sortBy?: PortfolioSortKey;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface PortfolioSummary {
  kpis: DashboardKpis;
  communities: PortfolioCommunitySummary[];
  /** Rows matching the type, search and view filters (before paging). */
  totalCount: number;
  /** Every managed community, unfiltered. The page picks its layout from this, so a search never changes the layout. */
  portfolioCount: number;
  /** Saved-view counts over the unfiltered portfolio. */
  viewCounts: { all: number; needsAttention: number; overdueDues: number };
}

const STATUS_ORDER: Record<PortfolioStatus, number> = {
  needs_attention: 0,
  on_track: 1,
  not_tracked: 2,
};

interface DerivedCompliance {
  score: number | null;
  pastDeadline: number;
  satisfied: number;
  applicable: number;
}

/**
 * Derive one community's compliance numbers from its raw checklist rows with
 * the Compliance page's own rule (`withDerivedStatus`).
 */
export function deriveCompliance(
  rows: ReadonlyArray<Record<string, unknown>>,
  documentStates: PortfolioStatusInputs['documentStates'],
  clockApplies: boolean,
): DerivedCompliance {
  let applicable = 0;
  let satisfied = 0;
  let pastDeadline = 0;
  for (const row of rows) {
    const status = withDerivedStatus(row, documentStates, clockApplies)['status'];
    if (status === 'not_applicable') continue;
    applicable += 1;
    if (status === 'satisfied') satisfied += 1;
    if (status === 'overdue') pastDeadline += 1;
  }
  return {
    score: applicable > 0 ? Math.round((satisfied / applicable) * 100) : null,
    pastDeadline,
    satisfied,
    applicable,
  };
}

/** The status rule, on already-measured numbers. */
export function classifyStatus(input: {
  communityType: CommunityType;
  complianceScore: number | null;
  pastDeadlineCount: number | null;
  overdueDuesCents: number | null;
}): PortfolioStatus {
  if (input.communityType === 'apartment') return 'not_tracked';
  if ((input.pastDeadlineCount ?? 0) > 0) return 'needs_attention';
  if ((input.overdueDuesCents ?? 0) > 0) return 'needs_attention';
  const measured = input.complianceScore !== null || input.overdueDuesCents !== null;
  return measured ? 'on_track' : 'not_tracked';
}

function brandColorOf(branding: unknown): string | null {
  if (!branding || typeof branding !== 'object') return null;
  const color = liveLook(branding as CommunityBranding).primaryColor;
  return typeof color === 'string' && isValidHexColor(color) ? color : null;
}

/**
 * Derive each condo/HOA community's compliance once. Apartments are absent:
 * they have no posting rules.
 */
export function deriveAllCompliance(
  rows: readonly DashboardCommunityRow[],
  inputs: PortfolioStatusInputs,
): Map<number, DerivedCompliance> {
  const checklistByCommunity = new Map<number, Array<Record<string, unknown>>>();
  for (const row of inputs.checklistRows) {
    const list = checklistByCommunity.get(row.communityId) ?? [];
    list.push(row as unknown as Record<string, unknown>);
    checklistByCommunity.set(row.communityId, list);
  }
  const derived = new Map<number, DerivedCompliance>();
  for (const row of rows) {
    if (row.communityType === 'apartment') continue;
    const clockApplies = postingClockApplies({
      communityType: row.communityType,
      unitCount: inputs.facts.get(row.communityId)?.unitCount ?? null,
    });
    derived.set(
      row.communityId,
      deriveCompliance(checklistByCommunity.get(row.communityId) ?? [], inputs.documentStates, clockApplies),
    );
  }
  return derived;
}

/** Attach the measured status to every row. Pure: all reads happen before. */
export function enrichRows(
  rows: readonly DashboardCommunityRow[],
  inputs: PortfolioStatusInputs,
  compliance: Map<number, DerivedCompliance> = deriveAllCompliance(rows, inputs),
): PortfolioCommunitySummary[] {
  return rows.map((row) => {
    const facts = inputs.facts.get(row.communityId);
    const isApartment = row.communityType === 'apartment';
    const derived = compliance.get(row.communityId);
    const complianceScore = derived ? derived.score : null;
    const pastDeadlineCount = derived ? derived.pastDeadline : null;

    const features = getEffectiveFeatures(
      row.communityType,
      resolvePlanId(facts?.subscriptionPlan ?? null),
    );
    const overdueDuesCents = !isApartment && features.hasFinance ? row.outstandingBalanceCents : null;

    return {
      ...row,
      complianceScore,
      pastDeadlineCount,
      overdueDuesCents,
      status: classifyStatus({
        communityType: row.communityType,
        complianceScore,
        pastDeadlineCount,
        overdueDuesCents,
      }),
      brandColor: brandColorOf(facts?.branding),
    };
  });
}

/** Portfolio compliance KPI with the Compliance page's rule (condo/HOA only). */
export function portfolioComplianceScore(
  rows: readonly DashboardCommunityRow[],
  compliance: Map<number, DerivedCompliance>,
): number | null {
  let satisfied = 0;
  let applicable = 0;
  for (const row of rows) {
    const derived = compliance.get(row.communityId);
    if (!derived) continue;
    satisfied += derived.satisfied;
    applicable += derived.applicable;
  }
  return applicable > 0 ? Math.round((satisfied / applicable) * 100) : null;
}

function matchesFilters(row: PortfolioCommunitySummary, query: PortfolioSummaryQuery): boolean {
  if (query.communityType && row.communityType !== query.communityType) return false;
  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    if (!row.communityName.toLowerCase().includes(needle) && !row.slug.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (query.view === 'needs_attention' && row.status !== 'needs_attention') return false;
  if (query.view === 'overdue_dues' && !((row.overdueDuesCents ?? 0) > 0)) return false;
  return true;
}

function sortValue(row: PortfolioCommunitySummary, key: PortfolioSortKey): string | number | null {
  if (key === 'status') return STATUS_ORDER[row.status];
  const value = (row as unknown as Record<string, unknown>)[key];
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : Number(value);
}

/** Sort in place: nulls last in both directions; ties fall back to name. */
export function sortRows(
  rows: PortfolioCommunitySummary[],
  sortBy: PortfolioSortKey = 'communityName',
  sortDir: 'asc' | 'desc' = 'asc',
): PortfolioCommunitySummary[] {
  return rows.sort((a, b) => {
    const av = sortValue(a, sortBy);
    const bv = sortValue(b, sortBy);
    let cmp = 0;
    if (av === null && bv === null) cmp = 0;
    else if (av === null) return 1;
    else if (bv === null) return -1;
    else cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : av - Number(bv);
    if (sortDir === 'desc') cmp = -cmp;
    return cmp !== 0 ? cmp : a.communityName.localeCompare(b.communityName);
  });
}

/**
 * Build the summary for `userId`. Caller MUST have run the PM gate
 * (`requirePmPortfolioAccess`) first.
 */
export async function buildPortfolioSummary(
  userId: string,
  query: PortfolioSummaryQuery = {},
): Promise<PortfolioSummary> {
  const typeOrSearch = Boolean(query.communityType || query.search);
  const [portfolio, filteredForKpis] = await Promise.all([
    getPortfolioDashboard(userId, { unpaginated: true }),
    // KPIs keep following the type/search filter, as they always have.
    typeOrSearch
      ? getPortfolioDashboard(userId, {
          communityType: query.communityType,
          search: query.search,
          unpaginated: true,
        })
      : Promise.resolve(null),
  ]);

  const allRows = portfolio.communities;
  const inputs = await findPortfolioStatusInputsUnscoped(
    allRows.map((r) => r.communityId),
    allRows.filter((r) => r.communityType !== 'apartment').map((r) => r.communityId),
  );
  const compliance = deriveAllCompliance(allRows, inputs);
  const enriched = enrichRows(allRows, inputs, compliance);

  const viewCounts = {
    all: enriched.length,
    needsAttention: enriched.filter((r) => r.status === 'needs_attention').length,
    overdueDues: enriched.filter((r) => (r.overdueDuesCents ?? 0) > 0).length,
  };

  const filtered = sortRows(
    enriched.filter((row) => matchesFilters(row, query)),
    query.sortBy,
    query.sortDir,
  );
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 50;

  const kpiSource = filteredForKpis ?? portfolio;
  const kpiRows = enriched.filter((r) => matchesFilters(r, { communityType: query.communityType, search: query.search }));
  // Only the compliance KPI changes: it now matches the Compliance page (a
  // draft or deleted document no longer counts as posted). The delinquency KPI
  // keeps its current meaning until the page shows overdue dues per row;
  // changing it alone would stop it adding up to the Balance column.
  const kpis: DashboardKpis = {
    ...kpiSource.kpis,
    complianceScore: portfolioComplianceScore(kpiRows, compliance),
  };

  return {
    kpis,
    communities: filtered.slice(offset, offset + limit),
    totalCount: filtered.length,
    portfolioCount: enriched.length,
    viewCounts,
  };
}
