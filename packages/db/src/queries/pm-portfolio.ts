import { and, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../drizzle';
import { communities } from '../schema/communities';
import { complianceChecklistItems } from '../schema/compliance-checklist-items';
import { leases } from '../schema/leases';
import { maintenanceRequests } from '../schema/maintenance-requests';
import { units } from '../schema/units';
import { userRoles } from '../schema/user-roles';

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
 * Returns true when the given user holds `property_manager_admin` in at
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
        eq(userRoles.role, 'property_manager_admin'),
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
    eq(userRoles.role, 'property_manager_admin'),
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
      // Count residents (users with roles in community)
      db
        .select({
          communityId: userRoles.communityId,
          count: sql<number>`count(*)::int`,
        })
        .from(userRoles)
        .where(inArray(userRoles.communityId, communityIds))
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
            inArray(maintenanceRequests.status, ['open', 'in_progress']),
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
