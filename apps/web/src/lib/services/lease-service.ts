/**
 * Lease Service
 *
 * Tenant-scoped data helpers for /api/v1/leases. Routes own validation,
 * feature gating, audit semantics, renewal rules, and side effects; this file
 * owns table access.
 */
import { createScopedClient, leases, units, userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

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
 * List all active lease rows visible in the scoped community.
 *
 * AUTHZ: caller MUST have verified apartment lease access for this community.
 */
export async function listLeasesForCommunity(communityId: number): Promise<LeaseRow[]> {
  const scoped = createScopedClient(communityId);
  return (await scoped.query(leases)) as unknown as LeaseRow[];
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
