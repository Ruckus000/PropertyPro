/**
 * Lease Service
 *
 * Tenant-scoped data helpers for /api/v1/leases. Routes own validation,
 * feature gating, audit semantics, renewal rules, and side effects; this file
 * owns table access.
 */
import { createScopedClient, leases, units, userRoles } from '@propertypro/db';
import { and, desc, eq, isNotNull, lte, type SQL } from '@propertypro/db/filters';

export interface LeaseRow {
  [key: string]: unknown;
  id: number;
  communityId?: number;
  unitId: number;
  residentId: string;
  startDate: string;
  endDate?: string | null;
  rentAmount?: string | null;
  status: string;
  previousLeaseId?: number | null;
  notes?: string | null;
}

export interface UnitLeaseDefaults {
  [key: string]: unknown;
  id: number;
  rentAmount?: string | null;
}

export interface TenantRoleForLease {
  [key: string]: unknown;
  userId: string;
  role: unknown;
  isUnitOwner?: boolean | null;
}

/**
 * Hard ceiling on one `listLeasesForCommunity` read (PAG-04).
 *
 * The GET list cannot be paginated yet without breaking its only consumer:
 * `LeaseListPage` derives its "Vacant Units" view from the WHOLE list
 * (units with no active lease), so a page of leases would misreport vacancy.
 * The hard-tier design (b3-hard-tier-pagination-design-2026-05-11.md, Leases)
 * also says to split `renewal_chain_for` out before paginating. Until then
 * the read is bounded by this explicit cap instead of being unbounded.
 *
 * Rows are fetched NEWEST-first (`id desc`) so that, if a community ever
 * exceeds the cap, what falls off is the oldest lease history, not the
 * current leases the vacancy view depends on. The caller receives the rows
 * back in ascending id order, which is what the old unordered full-table read
 * returned in practice (heap order ≈ insertion order).
 */
export const LEASE_LIST_MAX_ROWS = 5000;

/**
 * Hard ceiling on renewal-chain links walked by `getLeaseRenewalChain`.
 * A chain gains one link per renewal; 240 is twenty years of monthly
 * renewals. The walk also stops on a cycle.
 */
export const LEASE_RENEWAL_CHAIN_MAX_LINKS = 240;

export interface LeaseListFilters {
  /** Party scope: only leases naming this resident (non-manager callers). */
  residentId?: string;
  /** Exact status. The caller must pass a valid `lease_status` enum value. */
  status?: string;
  unitId?: number;
  /**
   * Expiring filter pushdown: `status = 'active' AND end_date IS NOT NULL AND
   * end_date <= <this YYYY-MM-DD>` — the same predicate
   * `getExpiringLeases` applies in JS (inclusive window end).
   */
  activeEndingOnOrBefore?: string;
}

export interface LeaseListResult {
  rows: LeaseRow[];
  /** True when more than `LEASE_LIST_MAX_ROWS` rows matched; the oldest were dropped. */
  truncated: boolean;
}

function buildLeaseListWhere(filters: LeaseListFilters): SQL | undefined {
  const clauses: SQL[] = [];
  if (filters.residentId !== undefined) clauses.push(eq(leases.residentId, filters.residentId));
  if (filters.status !== undefined) {
    clauses.push(eq(leases.status, filters.status as LeaseStatusValue));
  }
  if (filters.unitId !== undefined) clauses.push(eq(leases.unitId, filters.unitId));
  if (filters.activeEndingOnOrBefore !== undefined) {
    clauses.push(eq(leases.status, 'active'));
    clauses.push(isNotNull(leases.endDate));
    clauses.push(lte(leases.endDate, filters.activeEndingOnOrBefore));
  }
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

type LeaseStatusValue = (typeof leases.status.enumValues)[number];

/**
 * List lease rows in the scoped community, with every filter applied in SQL
 * and at most `LEASE_LIST_MAX_ROWS` rows read (see that constant).
 *
 * AUTHZ: caller MUST have verified apartment lease access for this community,
 * and MUST pass `residentId` for a caller who is not management tier.
 */
export async function listLeasesForCommunity(
  communityId: number,
  filters: LeaseListFilters = {},
): Promise<LeaseListResult> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped
    .selectFrom<LeaseRow>(leases, {}, buildLeaseListWhere(filters))
    .orderBy(desc(leases.id))
    .limit(LEASE_LIST_MAX_ROWS + 1)) as LeaseRow[];
  const truncated = rows.length > LEASE_LIST_MAX_ROWS;
  const kept = truncated ? rows.slice(0, LEASE_LIST_MAX_ROWS) : rows;
  return { rows: kept.reverse(), truncated };
}

/**
 * Walk one lease's renewal chain backwards through `previous_lease_id`, one
 * primary-key read per link, instead of loading every lease in the community.
 * Returns oldest → newest (the requested lease last), matching
 * `getRenewalChain` in lease-expiration-service.
 *
 * `residentId` applies the same party scope as the list: a link that does
 * not name that resident ends the walk, exactly as it did when the walk ran
 * over the party-filtered full list.
 */
export async function getLeaseRenewalChain(
  communityId: number,
  leaseId: number,
  options: { residentId?: string } = {},
): Promise<LeaseRow[]> {
  const scoped = createScopedClient(communityId);
  const chain: LeaseRow[] = [];
  const visited = new Set<number>();
  let nextId: number | null = leaseId;

  while (nextId !== null && chain.length < LEASE_RENEWAL_CHAIN_MAX_LINKS) {
    if (visited.has(nextId)) break;
    visited.add(nextId);
    const idMatch: SQL = eq(leases.id, nextId);
    const where: SQL | undefined =
      options.residentId !== undefined
        ? and(idMatch, eq(leases.residentId, options.residentId))
        : idMatch;
    const rows: LeaseRow[] = await scoped.selectFrom<LeaseRow>(leases, {}, where);
    const row: LeaseRow | undefined = rows[0];
    if (!row) break;
    chain.unshift(row);
    nextId = row.previousLeaseId ?? null;
  }

  return chain;
}

/**
 * Fetch the lease that renews `leaseId` (its `previous_lease_id` child), if any.
 */
export async function getRenewalOfLease(
  communityId: number,
  leaseId: number,
): Promise<LeaseRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<LeaseRow>(leases, {}, eq(leases.previousLeaseId, leaseId))
    .orderBy(leases.id)
    .limit(1);
  return (rows[0] as LeaseRow | undefined) ?? null;
}

/**
 * Fetch one unit's lease defaults.
 *
 * AUTHZ: caller MUST have verified apartment lease write access.
 */
export async function getUnitLeaseDefaults(
  communityId: number,
  unitId: number,
): Promise<UnitLeaseDefaults | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<UnitLeaseDefaults>(
    units,
    { id: units.id, rentAmount: units.rentAmount },
    eq(units.id, unitId),
  );
  return rows[0] ?? null;
}

/**
 * Fetch the tenant resident role for lease creation.
 *
 * AUTHZ: caller MUST have verified apartment lease write access.
 */
export async function getTenantRoleForLease(
  communityId: number,
  residentId: string,
): Promise<TenantRoleForLease | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<TenantRoleForLease>(
    userRoles,
    { userId: userRoles.userId, role: userRoles.role, isUnitOwner: userRoles.isUnitOwner },
    eq(userRoles.userId, residentId),
  );
  const role = rows.find((row) => row.role === 'resident' && row.isUnitOwner !== true);
  return role ?? null;
}

/**
 * Mark a previous lease as renewed.
 */
export async function markLeaseRenewed(
  communityId: number,
  leaseId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(leases, { status: 'renewed' }, eq(leases.id, leaseId));
}

/**
 * Create a lease row.
 */
export async function createLeaseForCommunity(
  communityId: number,
  values: Record<string, unknown>,
): Promise<LeaseRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(leases, values);
  return (rows[0] as unknown as LeaseRow | undefined) ?? null;
}

/**
 * Fetch one active lease by id.
 */
export async function getLeaseById(
  communityId: number,
  leaseId: number,
): Promise<LeaseRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<LeaseRow>(
    leases,
    {},
    eq(leases.id, leaseId),
  );
  return rows[0] ?? null;
}

/**
 * Update one active lease row.
 */
export async function updateLeaseForCommunity(
  communityId: number,
  leaseId: number,
  values: Record<string, unknown>,
): Promise<LeaseRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.update(leases, values, eq(leases.id, leaseId));
  return (rows[0] as unknown as LeaseRow | undefined) ?? null;
}

/**
 * Soft-delete one active lease row.
 */
export async function softDeleteLeaseForCommunity(
  communityId: number,
  leaseId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.softDelete(leases, eq(leases.id, leaseId));
}
