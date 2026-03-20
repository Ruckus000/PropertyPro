import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../drizzle';
import { assessmentLineItems } from '../schema/assessment-line-items';
import { communities } from '../schema/communities';
import { complianceChecklistItems } from '../schema/compliance-checklist-items';
import { leases } from '../schema/leases';
import { maintenanceRequests } from '../schema/maintenance-requests';
import { units } from '../schema/units';
import { userRoles } from '../schema/user-roles';
import { violations } from '../schema/violations';

export interface PortfolioQueryFilters {
  communityType?: 'condo_718' | 'hoa_720' | 'apartment';
  search?: string;
}

export interface ManagedCommunityPortfolioRow {
  communityId: number;
  communityName: string;
  slug: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  timezone: string;
  residentCount: number;
  totalUnits: number;
  openMaintenanceRequests: number;
  unsatisfiedComplianceItems: number;
  /** Count of distinct units with an active lease (apartment only, else 0) */
  occupiedUnits: number;
  /** Rounded occupancy percentage (apartment only when totalUnits > 0, else null) */
  occupancyRate: number | null;
}

function toCountMap<T extends { communityId: number; count: number }>(
  rows: readonly T[],
): Map<number, number> {
  return new Map(rows.map((row) => [row.communityId, Number(row.count)]));
}

/**
 * Returns true when the given user holds `pm_admin` in at
 * least one non-deleted community.  Intentionally unscoped — callers must
 * only expose this through `@propertypro/db/unsafe`.
 */
export async function isPmAdminInAnyCommunity(
  userId: string,
): Promise<boolean> {
  const row = await db
    .select({ communityId: userRoles.communityId })
    .from(userRoles)
    .innerJoin(communities, eq(communities.id, userRoles.communityId))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, 'pm_admin'),
        isNull(communities.deletedAt),
      ),
    )
    .limit(1);

  return row.length > 0;
}

/**
 * Unscoped PM portfolio query helper.
 *
 * This helper intentionally performs cross-community reads for a PM user and
 * therefore must only be exposed through `@propertypro/db/unsafe`.
 */
export async function findManagedCommunitiesPortfolioUnscoped(
  pmUserId: string,
  filters: PortfolioQueryFilters = {},
): Promise<ManagedCommunityPortfolioRow[]> {
  const conditions: SQL[] = [
    eq(userRoles.userId, pmUserId),
    eq(userRoles.role, 'pm_admin'),
    isNull(communities.deletedAt),
  ];

  if (filters.communityType) {
    conditions.push(eq(communities.communityType, filters.communityType));
  }

  if (filters.search) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(communities.name, pattern), ilike(communities.slug, pattern))!);
  }

  const managedRows = await db
    .select({
      communityId: communities.id,
      communityName: communities.name,
      slug: communities.slug,
      communityType: communities.communityType,
      timezone: communities.timezone,
    })
    .from(userRoles)
    .innerJoin(communities, eq(communities.id, userRoles.communityId))
    .where(and(...conditions))
    .orderBy(communities.name);

  if (managedRows.length === 0) {
    return [];
  }

  const communityIds = managedRows.map((row) => row.communityId);
  const apartmentIds = managedRows
    .filter((row) => row.communityType === 'apartment')
    .map((row) => row.communityId);

  const [residentCountsRaw, unitCountsRaw, maintenanceCountsRaw, complianceCountsRaw, occupiedUnitsRaw] =
    await Promise.all([
      // Count residents (users with 'resident' role in community)
      db
        .select({
          communityId: userRoles.communityId,
          count: sql<number>`count(*)::int`,
        })
        .from(userRoles)
        .where(and(inArray(userRoles.communityId, communityIds), eq(userRoles.role, 'resident')))
        .groupBy(userRoles.communityId),

      // Count units
      db
        .select({
          communityId: units.communityId,
          count: sql<number>`count(*)::int`,
        })
        .from(units)
        .where(and(inArray(units.communityId, communityIds), isNull(units.deletedAt)))
        .groupBy(units.communityId),

      // Count open maintenance requests (status in open/submitted/acknowledged/in_progress)
      db
        .select({
          communityId: maintenanceRequests.communityId,
          count: sql<number>`count(*)::int`,
        })
        .from(maintenanceRequests)
        .where(
          and(
            inArray(maintenanceRequests.communityId, communityIds),
            isNull(maintenanceRequests.deletedAt),
            inArray(maintenanceRequests.status, ['open', 'submitted', 'acknowledged', 'in_progress']),
          ),
        )
        .groupBy(maintenanceRequests.communityId),

      // Count unsatisfied compliance items (documentId is null)
      db
        .select({
          communityId: complianceChecklistItems.communityId,
          count: sql<number>`count(*)::int`,
        })
        .from(complianceChecklistItems)
        .where(
          and(
            inArray(complianceChecklistItems.communityId, communityIds),
            isNull(complianceChecklistItems.deletedAt),
            isNull(complianceChecklistItems.documentId),
          ),
        )
        .groupBy(complianceChecklistItems.communityId),

      // Count distinct occupied units via active leases (apartment communities only)
      apartmentIds.length > 0
        ? db
            .select({
              communityId: leases.communityId,
              count: sql<number>`count(distinct ${leases.unitId})::int`,
            })
            .from(leases)
            .where(
              and(
                inArray(leases.communityId, apartmentIds),
                isNull(leases.deletedAt),
                eq(leases.status, 'active'),
              ),
            )
            .groupBy(leases.communityId)
        : Promise.resolve([]),
    ]);

  const residentCounts = toCountMap(residentCountsRaw);
  const unitCounts = toCountMap(unitCountsRaw);
  const maintenanceCounts = toCountMap(maintenanceCountsRaw);
  const complianceCounts = toCountMap(complianceCountsRaw);
  const occupiedUnitCounts = toCountMap(occupiedUnitsRaw);

  return managedRows.map((row) => {
    const totalUnits = unitCounts.get(row.communityId) ?? 0;
    const occupiedUnits =
      row.communityType === 'apartment' ? (occupiedUnitCounts.get(row.communityId) ?? 0) : 0;
    const occupancyRate =
      row.communityType === 'apartment' && totalUnits > 0
        ? Math.round((occupiedUnits / totalUnits) * 100)
        : null;

    return {
      communityId: row.communityId,
      communityName: row.communityName,
      slug: row.slug,
      communityType: row.communityType,
      timezone: row.timezone,
      residentCount: residentCounts.get(row.communityId) ?? 0,
      totalUnits,
      openMaintenanceRequests: maintenanceCounts.get(row.communityId) ?? 0,
      unsatisfiedComplianceItems: complianceCounts.get(row.communityId) ?? 0,
      occupiedUnits,
      occupancyRate,
    };
  });
}

// ─── Dashboard KPI Types ───

export interface DashboardKpis {
  totalUnits: number;
  occupancyRate: number | null;
  occupancyDelta: number | null;
  openMaintenance: number;
  maintenanceDelta: number | null;
  complianceScore: number | null;
  complianceDelta: number | null;
  delinquencyTotal: number;
  delinquencyDelta: number | null;
  expiringLeases: number;
}

export interface DashboardCommunityRow extends ManagedCommunityPortfolioRow {
  outstandingBalanceCents: number;
}

export interface DashboardFilters extends PortfolioQueryFilters {
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface PortfolioDashboardResult {
  kpis: DashboardKpis;
  communities: DashboardCommunityRow[];
  totalCount: number;
}

function calcDelta(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 100);
}

/**
 * Aggregate portfolio dashboard data — KPIs with trend deltas + per-community rows.
 *
 * **Authorization contract:** callers MUST verify PM role via
 * `isPmAdminInAnyCommunity` before calling.
 */
export async function getPortfolioDashboard(
  pmUserId: string,
  filters: DashboardFilters = {},
): Promise<PortfolioDashboardResult> {
  // 1. Get base portfolio rows (reuse existing function for community list)
  const allRows = await findManagedCommunitiesPortfolioUnscoped(pmUserId, {
    communityType: filters.communityType,
    search: filters.search,
  });

  if (allRows.length === 0) {
    return {
      kpis: {
        totalUnits: 0,
        occupancyRate: null,
        occupancyDelta: null,
        openMaintenance: 0,
        maintenanceDelta: null,
        complianceScore: null,
        complianceDelta: null,
        delinquencyTotal: 0,
        delinquencyDelta: null,
        expiringLeases: 0,
      },
      communities: [],
      totalCount: 0,
    };
  }

  const communityIds = allRows.map((r) => r.communityId);
  const apartmentIds = allRows
    .filter((r) => r.communityType === 'apartment')
    .map((r) => r.communityId);
  const condoHoaIds = allRows
    .filter((r) => r.communityType !== 'apartment')
    .map((r) => r.communityId);

  const now = sql`NOW()`;
  const thirtyDaysAgo = sql`NOW() - INTERVAL '30 days'`;
  const sixtyDaysAgo = sql`NOW() - INTERVAL '60 days'`;
  const sixtyDaysFromNow = sql`NOW() + INTERVAL '60 days'`;

  // 2. Parallel aggregate queries for KPI deltas
  const [
    maintenanceTrend,
    delinquencyData,
    occupancyPrior,
    expiringLeaseCount,
    complianceTotalRaw,
  ] = await Promise.all([
    // Maintenance trend: current 30d vs prior 30d
    db
      .select({
        currentPeriod: sql<number>`count(*) FILTER (WHERE ${maintenanceRequests.createdAt} > ${thirtyDaysAgo})::int`,
        priorPeriod: sql<number>`count(*) FILTER (WHERE ${maintenanceRequests.createdAt} BETWEEN ${sixtyDaysAgo} AND ${thirtyDaysAgo})::int`,
      })
      .from(maintenanceRequests)
      .where(
        and(
          inArray(maintenanceRequests.communityId, communityIds),
          isNull(maintenanceRequests.deletedAt),
        ),
      ),

    // Delinquency: sum of overdue assessment line items by community
    db
      .select({
        communityId: assessmentLineItems.communityId,
        totalCents: sql<number>`coalesce(sum(${assessmentLineItems.amountCents} + ${assessmentLineItems.lateFeeCents}), 0)::int`,
      })
      .from(assessmentLineItems)
      .where(
        and(
          inArray(assessmentLineItems.communityId, communityIds),
          isNull(assessmentLineItems.deletedAt),
          eq(assessmentLineItems.status, 'overdue'),
        ),
      )
      .groupBy(assessmentLineItems.communityId),

    // Occupancy 30 days ago (apartment only) for trend
    apartmentIds.length > 0
      ? db
          .select({
            count: sql<number>`count(distinct ${leases.unitId})::int`,
          })
          .from(leases)
          .where(
            and(
              inArray(leases.communityId, apartmentIds),
              isNull(leases.deletedAt),
              eq(leases.status, 'active'),
              lte(leases.startDate, sql`(${thirtyDaysAgo})::date`),
              or(
                isNull(leases.endDate),
                gte(leases.endDate, sql`(${thirtyDaysAgo})::date`),
              ),
            ),
          )
      : Promise.resolve([{ count: 0 }]),

    // Leases expiring within 60 days
    apartmentIds.length > 0
      ? db
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(leases)
          .where(
            and(
              inArray(leases.communityId, apartmentIds),
              isNull(leases.deletedAt),
              eq(leases.status, 'active'),
              lte(leases.endDate, sql`(${sixtyDaysFromNow})::date`),
              gte(leases.endDate, sql`CURRENT_DATE`),
            ),
          )
      : Promise.resolve([{ count: 0 }]),

    // Compliance totals (for condo/HOA only)
    condoHoaIds.length > 0
      ? db
          .select({
            total: sql<number>`count(*)::int`,
            satisfied: sql<number>`count(*) FILTER (WHERE ${complianceChecklistItems.documentId} IS NOT NULL)::int`,
          })
          .from(complianceChecklistItems)
          .where(
            and(
              inArray(complianceChecklistItems.communityId, condoHoaIds),
              isNull(complianceChecklistItems.deletedAt),
            ),
          )
      : Promise.resolve([{ total: 0, satisfied: 0 }]),
  ]);

  // 3. Compute KPIs
  const totalUnits = allRows.reduce((sum, r) => sum + r.totalUnits, 0);
  const totalOccupied = allRows
    .filter((r) => r.communityType === 'apartment')
    .reduce((sum, r) => sum + r.occupiedUnits, 0);
  const totalApartmentUnits = allRows
    .filter((r) => r.communityType === 'apartment')
    .reduce((sum, r) => sum + r.totalUnits, 0);
  const currentOccupancy =
    totalApartmentUnits > 0 ? Math.round((totalOccupied / totalApartmentUnits) * 100) : null;
  const priorOccupied = occupancyPrior[0]?.count ?? 0;
  const priorOccupancy =
    totalApartmentUnits > 0 ? Math.round((priorOccupied / totalApartmentUnits) * 100) : null;

  const openMaintenance = allRows.reduce((sum, r) => sum + r.openMaintenanceRequests, 0);
  const mTrend = maintenanceTrend[0];

  const delinquencyMap = new Map(delinquencyData.map((row) => [row.communityId, row.totalCents]));
  const delinquencyTotal = allRows.reduce(
    (sum, r) => sum + (delinquencyMap.get(r.communityId) ?? 0),
    0,
  );

  const compTotals = complianceTotalRaw[0] ?? { total: 0, satisfied: 0 };
  const complianceScore =
    condoHoaIds.length > 0 && compTotals.total > 0
      ? Math.round((compTotals.satisfied / compTotals.total) * 100)
      : null;

  const kpis: DashboardKpis = {
    totalUnits,
    occupancyRate: currentOccupancy,
    occupancyDelta:
      currentOccupancy !== null && priorOccupancy !== null
        ? currentOccupancy - priorOccupancy
        : null,
    openMaintenance,
    maintenanceDelta: mTrend ? calcDelta(mTrend.currentPeriod, mTrend.priorPeriod) : null,
    complianceScore,
    complianceDelta: null, // compliance trend requires historical snapshots — deferred
    delinquencyTotal,
    delinquencyDelta: null, // delinquency trend requires historical snapshots — deferred
    expiringLeases: expiringLeaseCount[0]?.count ?? 0,
  };

  // 4. Build community rows with outstanding balance
  const communityRows: DashboardCommunityRow[] = allRows.map((row) => ({
    ...row,
    outstandingBalanceCents: delinquencyMap.get(row.communityId) ?? 0,
  }));

  // 5. Sort
  const { sortBy = 'communityName', sortDir = 'asc' } = filters;
  communityRows.sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sortBy];
    const bVal = (b as unknown as Record<string, unknown>)[sortBy];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : Number(aVal) - Number(bVal);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  // 6. Paginate
  const totalCount = communityRows.length;
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 50;
  const paginated = communityRows.slice(offset, offset + limit);

  return { kpis, communities: paginated, totalCount };
}

// ─── Report Query Types ───

export interface DateRange {
  from: Date;
  to: Date;
}

export interface MaintenanceVolumeRow {
  month: string;
  open: number;
  inProgress: number;
  resolved: number;
  total: number;
}

export interface MaintenanceVolumeReport {
  kpis: { totalRequests: number; avgResolutionDays: number; openRequests: number };
  chartData: MaintenanceVolumeRow[];
  tableData: Array<{
    communityName: string;
    totalRequests: number;
    open: number;
    avgResolutionDays: number;
    longestOpenDays: number;
  }>;
}

export interface ComplianceStatusRow {
  communityName: string;
  communityType: string;
  score: number;
  satisfied: number;
  overdue: number;
  missing: number;
}

export interface ComplianceStatusReport {
  kpis: { portfolioScore: number; atRiskCount: number; overdueDocuments: number };
  chartData: ComplianceStatusRow[];
  tableData: ComplianceStatusRow[];
}

export interface OccupancyTrendRow {
  month: string;
  communityName: string;
  occupancyRate: number;
}

export interface OccupancyTrendsReport {
  kpis: { currentOccupancy: number; vacantUnits: number; expiringLeases: number };
  chartData: OccupancyTrendRow[];
  tableData: Array<{
    communityName: string;
    totalUnits: number;
    occupied: number;
    vacant: number;
    occupancyRate: number;
    expiring60d: number;
  }>;
}

export interface ViolationSummaryRow {
  category: string;
  open: number;
  resolved: number;
  total: number;
}

export interface ViolationSummaryReport {
  kpis: { totalViolations: number; openViolations: number; totalFines: number | null };
  chartData: ViolationSummaryRow[];
  tableData: Array<{
    communityName: string;
    totalViolations: number;
    open: number;
    fined: number;
    resolved: number;
    totalFinesCents: number | null;
  }>;
}

export interface DelinquencyAgingRow {
  communityName: string;
  current0_30: number;
  days31_60: number;
  days61_90: number;
  days90Plus: number;
  total: number;
}

export interface DelinquencyAgingReport {
  kpis: { totalOutstandingCents: number; delinquentUnits: number; avgDaysOverdue: number };
  chartData: DelinquencyAgingRow[];
  tableData: (DelinquencyAgingRow & { unitsDelinquent: number })[];
}

/**
 * Resolves the list of managed community IDs for a PM.
 * Utility for report queries.
 */
async function getManagedCommunityIds(
  pmUserId: string,
  requestedIds?: number[],
): Promise<{ communityIds: number[]; communityMap: Map<number, { name: string; type: string }> }> {
  const allManaged = await findManagedCommunitiesPortfolioUnscoped(pmUserId);
  const communityMap = new Map(
    allManaged.map((r) => [r.communityId, { name: r.communityName, type: r.communityType }]),
  );

  let communityIds = allManaged.map((r) => r.communityId);
  if (requestedIds && requestedIds.length > 0) {
    communityIds = requestedIds.filter((id) => communityMap.has(id));
  }

  return { communityIds, communityMap };
}

/**
 * Maintenance volume report — monthly counts by status.
 */
export async function getMaintenanceVolumeReport(
  pmUserId: string,
  communityIdFilter?: number[],
  dateRange?: DateRange,
): Promise<MaintenanceVolumeReport> {
  const { communityIds, communityMap } = await getManagedCommunityIds(pmUserId, communityIdFilter);
  if (communityIds.length === 0) {
    return { kpis: { totalRequests: 0, avgResolutionDays: 0, openRequests: 0 }, chartData: [], tableData: [] };
  }

  const conditions: SQL[] = [
    inArray(maintenanceRequests.communityId, communityIds),
    isNull(maintenanceRequests.deletedAt),
  ];
  if (dateRange) {
    conditions.push(gte(maintenanceRequests.createdAt, dateRange.from));
    conditions.push(lte(maintenanceRequests.createdAt, dateRange.to));
  }

  const [monthlyData, communityData, kpiData] = await Promise.all([
    db
      .select({
        month: sql<string>`to_char(${maintenanceRequests.createdAt}, 'YYYY-MM')`,
        open: sql<number>`count(*) FILTER (WHERE ${maintenanceRequests.status} IN ('open', 'submitted', 'acknowledged'))::int`,
        inProgress: sql<number>`count(*) FILTER (WHERE ${maintenanceRequests.status} = 'in_progress')::int`,
        resolved: sql<number>`count(*) FILTER (WHERE ${maintenanceRequests.status} IN ('resolved', 'closed'))::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(maintenanceRequests)
      .where(and(...conditions))
      .groupBy(sql`to_char(${maintenanceRequests.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${maintenanceRequests.createdAt}, 'YYYY-MM')`),

    db
      .select({
        communityId: maintenanceRequests.communityId,
        totalRequests: sql<number>`count(*)::int`,
        open: sql<number>`count(*) FILTER (WHERE ${maintenanceRequests.status} IN ('open', 'submitted', 'acknowledged', 'in_progress'))::int`,
        avgResolutionDays: sql<number>`coalesce(avg(EXTRACT(EPOCH FROM (${maintenanceRequests.updatedAt} - ${maintenanceRequests.createdAt})) / 86400) FILTER (WHERE ${maintenanceRequests.status} IN ('resolved', 'closed')), 0)::int`,
        longestOpenDays: sql<number>`coalesce(max(EXTRACT(EPOCH FROM (NOW() - ${maintenanceRequests.createdAt})) / 86400) FILTER (WHERE ${maintenanceRequests.status} IN ('open', 'submitted', 'acknowledged', 'in_progress')), 0)::int`,
      })
      .from(maintenanceRequests)
      .where(and(...conditions))
      .groupBy(maintenanceRequests.communityId),

    db
      .select({
        totalRequests: sql<number>`count(*)::int`,
        avgResolutionDays: sql<number>`coalesce(avg(EXTRACT(EPOCH FROM (${maintenanceRequests.updatedAt} - ${maintenanceRequests.createdAt})) / 86400) FILTER (WHERE ${maintenanceRequests.status} IN ('resolved', 'closed')), 0)::int`,
        openRequests: sql<number>`count(*) FILTER (WHERE ${maintenanceRequests.status} IN ('open', 'submitted', 'acknowledged', 'in_progress'))::int`,
      })
      .from(maintenanceRequests)
      .where(and(...conditions)),
  ]);

  return {
    kpis: kpiData[0] ?? { totalRequests: 0, avgResolutionDays: 0, openRequests: 0 },
    chartData: monthlyData,
    tableData: communityData.map((row) => ({
      communityName: communityMap.get(row.communityId)?.name ?? `Community ${row.communityId}`,
      totalRequests: row.totalRequests,
      open: row.open,
      avgResolutionDays: row.avgResolutionDays,
      longestOpenDays: row.longestOpenDays,
    })),
  };
}

/**
 * Compliance status report — per-community compliance breakdown.
 */
export async function getComplianceStatusReport(
  pmUserId: string,
  communityIdFilter?: number[],
): Promise<ComplianceStatusReport> {
  const { communityIds, communityMap } = await getManagedCommunityIds(pmUserId, communityIdFilter);
  const condoHoaIds = communityIds.filter((id) => {
    const info = communityMap.get(id);
    return info && info.type !== 'apartment';
  });

  if (condoHoaIds.length === 0) {
    return { kpis: { portfolioScore: 0, atRiskCount: 0, overdueDocuments: 0 }, chartData: [], tableData: [] };
  }

  const communityData = await db
    .select({
      communityId: complianceChecklistItems.communityId,
      total: sql<number>`count(*)::int`,
      satisfied: sql<number>`count(*) FILTER (WHERE ${complianceChecklistItems.documentId} IS NOT NULL)::int`,
      overdue: sql<number>`count(*) FILTER (WHERE ${complianceChecklistItems.documentId} IS NULL AND ${complianceChecklistItems.deadline} < CURRENT_DATE)::int`,
      missing: sql<number>`count(*) FILTER (WHERE ${complianceChecklistItems.documentId} IS NULL)::int`,
    })
    .from(complianceChecklistItems)
    .where(
      and(
        inArray(complianceChecklistItems.communityId, condoHoaIds),
        isNull(complianceChecklistItems.deletedAt),
      ),
    )
    .groupBy(complianceChecklistItems.communityId);

  const rows: ComplianceStatusRow[] = communityData.map((row) => ({
    communityName: communityMap.get(row.communityId)?.name ?? '',
    communityType: communityMap.get(row.communityId)?.type ?? '',
    score: row.total > 0 ? Math.round((row.satisfied / row.total) * 100) : 0,
    satisfied: row.satisfied,
    overdue: row.overdue,
    missing: row.missing,
  }));

  const totalItems = communityData.reduce((s, r) => s + r.total, 0);
  const totalSatisfied = communityData.reduce((s, r) => s + r.satisfied, 0);
  const totalOverdue = communityData.reduce((s, r) => s + r.overdue, 0);
  const portfolioScore = totalItems > 0 ? Math.round((totalSatisfied / totalItems) * 100) : 0;
  const atRiskCount = rows.filter((r) => r.score < 80).length;

  return {
    kpis: { portfolioScore, atRiskCount, overdueDocuments: totalOverdue },
    chartData: rows.sort((a, b) => a.score - b.score),
    tableData: rows,
  };
}

/**
 * Violation summary report — by category and community.
 */
export async function getViolationSummaryReport(
  pmUserId: string,
  communityIdFilter?: number[],
  dateRange?: DateRange,
): Promise<ViolationSummaryReport> {
  const { communityIds, communityMap } = await getManagedCommunityIds(pmUserId, communityIdFilter);
  if (communityIds.length === 0) {
    return { kpis: { totalViolations: 0, openViolations: 0, totalFines: 0 }, chartData: [], tableData: [] };
  }

  const conditions: SQL[] = [
    inArray(violations.communityId, communityIds),
    isNull(violations.deletedAt),
  ];
  if (dateRange) {
    conditions.push(gte(violations.createdAt, dateRange.from));
    conditions.push(lte(violations.createdAt, dateRange.to));
  }

  const [categoryData, communityData, kpiData] = await Promise.all([
    db
      .select({
        category: violations.category,
        open: sql<number>`count(*) FILTER (WHERE ${violations.status} NOT IN ('resolved', 'dismissed'))::int`,
        resolved: sql<number>`count(*) FILTER (WHERE ${violations.status} IN ('resolved', 'dismissed'))::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(violations)
      .where(and(...conditions))
      .groupBy(violations.category)
      .orderBy(sql`count(*) DESC`),

    db
      .select({
        communityId: violations.communityId,
        totalViolations: sql<number>`count(*)::int`,
        open: sql<number>`count(*) FILTER (WHERE ${violations.status} NOT IN ('resolved', 'dismissed'))::int`,
        fined: sql<number>`count(*) FILTER (WHERE ${violations.status} = 'fined')::int`,
        resolved: sql<number>`count(*) FILTER (WHERE ${violations.status} IN ('resolved', 'dismissed'))::int`,
      })
      .from(violations)
      .where(and(...conditions))
      .groupBy(violations.communityId),

    db
      .select({
        totalViolations: sql<number>`count(*)::int`,
        openViolations: sql<number>`count(*) FILTER (WHERE ${violations.status} NOT IN ('resolved', 'dismissed'))::int`,
      })
      .from(violations)
      .where(and(...conditions)),
  ]);

  return {
    kpis: {
      totalViolations: kpiData[0]?.totalViolations ?? 0,
      openViolations: kpiData[0]?.openViolations ?? 0,
      totalFines: null, // Stub — requires join to violation_fines table (not yet implemented)
    },
    chartData: categoryData.map((row) => ({
      category: row.category ?? 'Other',
      open: row.open,
      resolved: row.resolved,
      total: row.total,
    })),
    tableData: communityData.map((row) => ({
      communityName: communityMap.get(row.communityId)?.name ?? '',
      totalViolations: row.totalViolations,
      open: row.open,
      fined: row.fined,
      resolved: row.resolved,
      totalFinesCents: null, // Stub — requires violation_fines join
    })),
  };
}

/**
 * Delinquency aging report — 30/60/90/90+ day buckets by community.
 */
export async function getDelinquencyAgingReport(
  pmUserId: string,
  communityIdFilter?: number[],
): Promise<DelinquencyAgingReport> {
  const { communityIds, communityMap } = await getManagedCommunityIds(pmUserId, communityIdFilter);
  if (communityIds.length === 0) {
    return { kpis: { totalOutstandingCents: 0, delinquentUnits: 0, avgDaysOverdue: 0 }, chartData: [], tableData: [] };
  }

  const agingData = await db
    .select({
      communityId: assessmentLineItems.communityId,
      current0_30: sql<number>`coalesce(sum(${assessmentLineItems.amountCents} + ${assessmentLineItems.lateFeeCents}) FILTER (WHERE CURRENT_DATE - ${assessmentLineItems.dueDate}::date BETWEEN 0 AND 30), 0)::int`,
      days31_60: sql<number>`coalesce(sum(${assessmentLineItems.amountCents} + ${assessmentLineItems.lateFeeCents}) FILTER (WHERE CURRENT_DATE - ${assessmentLineItems.dueDate}::date BETWEEN 31 AND 60), 0)::int`,
      days61_90: sql<number>`coalesce(sum(${assessmentLineItems.amountCents} + ${assessmentLineItems.lateFeeCents}) FILTER (WHERE CURRENT_DATE - ${assessmentLineItems.dueDate}::date BETWEEN 61 AND 90), 0)::int`,
      days90Plus: sql<number>`coalesce(sum(${assessmentLineItems.amountCents} + ${assessmentLineItems.lateFeeCents}) FILTER (WHERE CURRENT_DATE - ${assessmentLineItems.dueDate}::date > 90), 0)::int`,
      total: sql<number>`coalesce(sum(${assessmentLineItems.amountCents} + ${assessmentLineItems.lateFeeCents}), 0)::int`,
      unitsDelinquent: sql<number>`count(distinct ${assessmentLineItems.unitId})::int`,
      avgDays: sql<number>`coalesce(avg(CURRENT_DATE - ${assessmentLineItems.dueDate}::date), 0)::int`,
    })
    .from(assessmentLineItems)
    .where(
      and(
        inArray(assessmentLineItems.communityId, communityIds),
        isNull(assessmentLineItems.deletedAt),
        eq(assessmentLineItems.status, 'overdue'),
      ),
    )
    .groupBy(assessmentLineItems.communityId);

  const totalOutstandingCents = agingData.reduce((s, r) => s + r.total, 0);
  const totalDelinquentUnits = agingData.reduce((s, r) => s + r.unitsDelinquent, 0);
  const avgDaysOverdue =
    agingData.length > 0
      ? Math.round(
          agingData.reduce((s, r) => s + r.avgDays * r.unitsDelinquent, 0) /
          Math.max(agingData.reduce((s, r) => s + r.unitsDelinquent, 0), 1)
        )
      : 0;

  const rows = agingData.map((row) => ({
    communityName: communityMap.get(row.communityId)?.name ?? '',
    current0_30: row.current0_30,
    days31_60: row.days31_60,
    days61_90: row.days61_90,
    days90Plus: row.days90Plus,
    total: row.total,
    unitsDelinquent: row.unitsDelinquent,
  }));

  return {
    kpis: { totalOutstandingCents, delinquentUnits: totalDelinquentUnits, avgDaysOverdue },
    chartData: rows.map(({ unitsDelinquent, ...rest }) => rest),
    tableData: rows,
  };
}

/**
 * Occupancy trends report — monthly occupancy by apartment community.
 */
export async function getOccupancyTrendsReport(
  pmUserId: string,
  communityIdFilter?: number[],
  dateRange?: DateRange,
): Promise<OccupancyTrendsReport> {
  const { communityIds, communityMap } = await getManagedCommunityIds(pmUserId, communityIdFilter);
  const apartmentIds = communityIds.filter((id) => communityMap.get(id)?.type === 'apartment');

  if (apartmentIds.length === 0) {
    return { kpis: { currentOccupancy: 0, vacantUnits: 0, expiringLeases: 0 }, chartData: [], tableData: [] };
  }

  // Get current snapshot per community
  const [currentData, expiringCount] = await Promise.all([
    db
      .select({
        communityId: units.communityId,
        totalUnits: sql<number>`count(*)::int`,
        occupied: sql<number>`count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM ${leases}
          WHERE ${leases.unitId} = ${units.id}
            AND ${leases.status} = 'active'
            AND ${leases.deletedAt} IS NULL
        ))::int`,
      })
      .from(units)
      .where(
        and(
          inArray(units.communityId, apartmentIds),
          isNull(units.deletedAt),
        ),
      )
      .groupBy(units.communityId),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leases)
      .where(
        and(
          inArray(leases.communityId, apartmentIds),
          isNull(leases.deletedAt),
          eq(leases.status, 'active'),
          lte(leases.endDate, sql`(NOW() + INTERVAL '60 days')::date`),
          gte(leases.endDate, sql`CURRENT_DATE`),
        ),
      ),
  ]);

  const totalUnits = currentData.reduce((s, r) => s + r.totalUnits, 0);
  const totalOccupied = currentData.reduce((s, r) => s + r.occupied, 0);
  const currentOccupancy = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;

  const tableData = currentData.map((row) => ({
    communityName: communityMap.get(row.communityId)?.name ?? '',
    totalUnits: row.totalUnits,
    occupied: row.occupied,
    vacant: row.totalUnits - row.occupied,
    occupancyRate: row.totalUnits > 0 ? Math.round((row.occupied / row.totalUnits) * 100) : 0,
    expiring60d: 0, // Simplified — would need per-community lease count
  }));

  return {
    kpis: {
      currentOccupancy,
      vacantUnits: totalUnits - totalOccupied,
      expiringLeases: expiringCount[0]?.count ?? 0,
    },
    chartData: [], // Intentionally empty — monthly trend requires date-series generation (deferred to chart component)
    tableData,
  };
}
