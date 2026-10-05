/**
 * Lease Service
 *
 * Tenant-scoped data helpers for /api/v1/leases. Routes own validation,
 * feature gating, audit semantics, renewal rules, and side effects; this file
 * owns table access.
 */
import {
  communities,
  createScopedClient,
  leaseDeposits,
  leaseRenewalOffers,
  leaseResidents,
  leases,
  rentObligations,
  unitOccupants,
  units,
  userRoles,
} from '@propertypro/db';
import { and, asc, desc, eq, inArray, isNotNull, lte, or, sql, type SQL } from '@propertypro/db/filters';

export interface LeaseRow {
  [key: string]: unknown;
  id: number;
  communityId?: number;
  unitId: number;
  /** Primary resident's user id; null when the primary is a household member with no login (Leases v3). */
  residentId: string | null;
  startDate: string;
  endDate?: string | null;
  rentAmount?: string | null;
  status: string;
  previousLeaseId?: number | null;
  notes?: string | null;
  version?: number;
}

export interface UnitLeaseDefaults {
  [key: string]: unknown;
  id: number;
  rentAmount?: string | null;
  /** Leases v3 (E7): set when the unit is out of service. */
  offlineSince?: string | null;
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
/**
 * Hard ceiling on one `listLeasesForCommunity` read (PAG-04).
 *
 * Rows are fetched NEWEST-first (`id desc`) so that, if a community ever
 * exceeds the cap, what falls off is the oldest lease history, not the
 * current leases the roster depends on. Callers receive ascending id order.
 */
export const LEASE_LIST_MAX_ROWS = 5000;

export interface LeaseListFilters {
  /**
   * Party scope for non-manager callers (Leases v3): leases this user is a
   * CURRENT party to — a `lease_residents` row naming them with no
   * `removed_on`, so co-tenants qualify — or, for leases written by pre-v3
   * code during the expand window, `resident_id = user`.
   */
  partyUserId?: string;
  /** Exact status. The caller must pass a valid `lease_status` enum value. */
  status?: string;
  unitId?: number;
  /** `status = 'active' AND end_date IS NOT NULL AND end_date <= <YYYY-MM-DD>`. */
  activeEndingOnOrBefore?: string;
}

export interface LeaseListResult {
  rows: LeaseRow[];
  /** True when more than `LEASE_LIST_MAX_ROWS` rows matched; the oldest were dropped. */
  truncated: boolean;
}

type LeaseStatusValue = (typeof leases.status.enumValues)[number];

function buildLeaseListWhere(communityId: number, filters: LeaseListFilters): SQL | undefined {
  const clauses: SQL[] = [];
  if (filters.partyUserId !== undefined) {
    // Both halves key on the authenticated user id the route passes in. The
    // subquery repeats the community predicate: lease_residents is read here
    // outside the scoped client's automatic filter.
    clauses.push(
      or(
        eq(leases.residentId, filters.partyUserId),
        sql`${leases.id} IN (SELECT lr.lease_id FROM lease_residents lr WHERE lr.community_id = ${communityId} AND lr.user_id = ${filters.partyUserId} AND lr.removed_on IS NULL)`,
      )!,
    );
  }
  if (filters.status !== undefined) clauses.push(eq(leases.status, filters.status as LeaseStatusValue));
  if (filters.unitId !== undefined) clauses.push(eq(leases.unitId, filters.unitId));
  if (filters.activeEndingOnOrBefore !== undefined) {
    clauses.push(eq(leases.status, 'active'));
    clauses.push(isNotNull(leases.endDate));
    clauses.push(lte(leases.endDate, filters.activeEndingOnOrBefore));
    // A lease whose renewal is signed is not expiring: it stays `active`
    // until the renewal starts, but the renewal ends a term later, so it is
    // never in this window's rows for a JS check to find. Same rule as
    // leaseHasActiveRenewalSql in packages/db (inline here: the route tests
    // mock @propertypro/db).
    clauses.push(
      sql`NOT EXISTS (SELECT 1 FROM leases succ WHERE succ.previous_lease_id = ${leases.id} AND succ.status = 'active' AND succ.deleted_at IS NULL)`,
    );
  }
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * List lease rows in the scoped community, every filter applied in SQL and
 * at most `LEASE_LIST_MAX_ROWS` rows read.
 *
 * AUTHZ: caller MUST have verified apartment lease access for this community,
 * and MUST pass `partyUserId` for a caller who is not management tier.
 */
export async function listLeasesForCommunity(
  communityId: number,
  filters: LeaseListFilters = {},
): Promise<LeaseListResult> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped
    .selectFrom<LeaseRow>(leases, {}, buildLeaseListWhere(communityId, filters))
    .orderBy(desc(leases.id))
    .limit(LEASE_LIST_MAX_ROWS + 1)) as LeaseRow[];
  const truncated = rows.length > LEASE_LIST_MAX_ROWS;
  const kept = truncated ? rows.slice(0, LEASE_LIST_MAX_ROWS) : rows;
  return { rows: kept.reverse(), truncated };
}

/** The active lease that renews `leaseId` (its `previous_lease_id` child), if any. */
export async function getRenewalOfLease(communityId: number, leaseId: number): Promise<LeaseRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<LeaseRow>(leases, {}, and(eq(leases.previousLeaseId, leaseId), eq(leases.status, 'active')))
    .orderBy(leases.id)
    .limit(1);
  return (rows[0] as LeaseRow | undefined) ?? null;
}

/** The active lease a resident is transferring INTO from `leaseId` (E8), if any. */
export async function getTransferTargetOfLease(communityId: number, leaseId: number): Promise<LeaseRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped
    .selectFrom<LeaseRow>(leases, {}, and(eq(leases.transferredFromLeaseId, leaseId), eq(leases.status, 'active')))
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
    { id: units.id, rentAmount: units.rentAmount, offlineSince: units.offlineSince },
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
/**
 * Undo a lease written earlier in a request that then failed (create's later
 * steps, a transfer's move-out). Its residents and deposits go, so they cannot
 * block a household member's erasure, and its idempotency key is cleared, so
 * the client's retry with the same key creates the lease instead of colliding
 * with this hidden row (the key's unique index ignores deleted_at).
 */
export async function discardFailedLease(communityId: number, leaseId: number): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.hardDelete(leaseResidents, eq(leaseResidents.leaseId, leaseId));
  await scoped.hardDelete(leaseDeposits, eq(leaseDeposits.leaseId, leaseId));
  await scoped.update(leases, { idempotencyKey: null }, eq(leases.id, leaseId));
  await scoped.softDelete(leases, eq(leases.id, leaseId));
}

export async function softDeleteLeaseForCommunity(
  communityId: number,
  leaseId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.softDelete(leases, eq(leases.id, leaseId));
}

// ---------------------------------------------------------------------------
// Leases v3
// ---------------------------------------------------------------------------

export interface LeaseResidentRow {
  [key: string]: unknown;
  id: number;
  leaseId: number;
  userId: string | null;
  occupantId: number | null;
  isPrimary: boolean;
  addedOn: string;
  removedOn: string | null;
}

/** A household member with no login (main's `unit_occupants`), as a lease needs it. */
export interface LeaseOccupantRow {
  [key: string]: unknown;
  id: number;
  unitId: number;
  fullName: string;
  email: string | null;
  phone: string | null;
}

export interface LeaseDepositRow {
  [key: string]: unknown;
  id: number;
  leaseId: number;
  amount: string;
  heldMethod: string | null;
  depository: string | null;
  receivedOn: string | null;
  noticeSentOn: string | null;
  carriedFromDepositId: number | null;
  disposition: string | null;
  dispositionOn: string | null;
  claimedAmount: string | null;
}

export interface UnpaidObligationRow {
  [key: string]: unknown;
  id: number;
  periodStart: string;
  dueDate: string;
  amountCents: number;
  status: string;
}

export interface CommunityLeaseSettings {
  allowResidentsWithoutEmail: boolean;
  alertWindows: number[];
}

export const DEFAULT_LEASE_ALERT_WINDOWS = [30, 60, 90];

/**
 * Lease settings from `communities.community_settings`.
 *
 * `leasesAllowResidentsWithoutEmail` is read with a strict `=== true`, so an
 * absent key, null or the STRING "true" all mean off — a community keeps
 * today's behaviour until someone opts in.
 */
export async function getCommunityLeaseSettings(communityId: number): Promise<CommunityLeaseSettings> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<{ communitySettings: unknown }>(
    communities,
    { communitySettings: communities.communitySettings },
  );
  const settings = (rows[0]?.communitySettings ?? {}) as Record<string, unknown>;
  const rawWindows = settings['leaseAlertWindows'];
  const windows = Array.isArray(rawWindows)
    ? rawWindows.filter((n): n is number => Number.isInteger(n) && n > 0 && n <= 365)
    : [];
  return {
    allowResidentsWithoutEmail: settings['leasesAllowResidentsWithoutEmail'] === true,
    alertWindows: windows.length > 0 ? [...new Set(windows)].sort((a, b) => a - b) : DEFAULT_LEASE_ALERT_WINDOWS,
  };
}

/** lease_residents rows for the given leases (filter pushed into SQL). */
export async function listLeaseResidentsForLeases(
  communityId: number,
  leaseIds: number[],
): Promise<LeaseResidentRow[]> {
  if (leaseIds.length === 0) return [];
  const scoped = createScopedClient(communityId);
  return (await scoped.selectFrom<LeaseResidentRow>(
    leaseResidents,
    {},
    inArray(leaseResidents.leaseId, leaseIds),
  )) as LeaseResidentRow[];
}

/**
 * Lease ids the user is CURRENTLY a party to (a row naming them, not removed).
 * This is the resident read boundary for GET /api/v1/leases.
 */
export async function listLeaseIdsForParty(communityId: number, userId: string): Promise<Set<number>> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom<LeaseResidentRow>(
    leaseResidents,
    {},
    eq(leaseResidents.userId, userId),
  )) as LeaseResidentRow[];
  return new Set(rows.filter((r) => r.userId === userId && r.removedOn == null).map((r) => r.leaseId));
}

export async function insertLeaseResidents(
  communityId: number,
  rows: Array<{ leaseId: number; userId: string | null; occupantId: number | null; isPrimary: boolean; addedOn: string }>,
): Promise<LeaseResidentRow[]> {
  if (rows.length === 0) return [];
  const scoped = createScopedClient(communityId);
  return (await scoped.insert(leaseResidents, rows)) as unknown as LeaseResidentRow[];
}

export async function listOccupantsByIds(communityId: number, ids: number[]): Promise<LeaseOccupantRow[]> {
  if (ids.length === 0) return [];
  const scoped = createScopedClient(communityId);
  return (await scoped.selectFrom<LeaseOccupantRow>(
    unitOccupants,
    {
      id: unitOccupants.id,
      unitId: unitOccupants.unitId,
      fullName: unitOccupants.fullName,
      email: unitOccupants.email,
      phone: unitOccupants.phone,
    },
    inArray(unitOccupants.id, ids),
  )) as LeaseOccupantRow[];
}

export async function listLeaseDeposits(communityId: number, leaseIds: number[]): Promise<LeaseDepositRow[]> {
  if (leaseIds.length === 0) return [];
  const scoped = createScopedClient(communityId);
  // Oldest first, so `.at(-1)` is the newest deposit: without an ORDER BY,
  // Postgres returns heap order, which an UPDATE reshuffles.
  return (await scoped
    .selectFrom<LeaseDepositRow>(leaseDeposits, {}, inArray(leaseDeposits.leaseId, leaseIds))
    .orderBy(asc(leaseDeposits.id))) as LeaseDepositRow[];
}

export async function insertLeaseDeposit(
  communityId: number,
  values: Record<string, unknown>,
): Promise<LeaseDepositRow> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(leaseDeposits, values);
  return rows[0] as unknown as LeaseDepositRow;
}

export async function getLeaseDepositById(
  communityId: number,
  depositId: number,
): Promise<LeaseDepositRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<LeaseDepositRow>(leaseDeposits, {}, eq(leaseDeposits.id, depositId));
  return rows[0] ?? null;
}

export async function updateLeaseDeposit(
  communityId: number,
  depositId: number,
  values: Record<string, unknown>,
): Promise<LeaseDepositRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.update(leaseDeposits, values, eq(leaseDeposits.id, depositId));
  return (rows[0] as unknown as LeaseDepositRow | undefined) ?? null;
}

/**
 * Obligations on a lease that are still owed (not paid, not waived).
 *
 * Decisions D9: a lease with any of these cannot be cancelled, deleted or
 * transferred — nothing generates rent today, but rows inserted outside the
 * app would otherwise stay payable against a lease that no longer exists.
 */
export async function listUnpaidObligationsForLease(
  communityId: number,
  leaseId: number,
): Promise<UnpaidObligationRow[]> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom<UnpaidObligationRow>(
    rentObligations,
    {
      id: rentObligations.id,
      periodStart: rentObligations.periodStart,
      dueDate: rentObligations.dueDate,
      amountCents: rentObligations.amountCents,
      status: rentObligations.status,
    },
    eq(rentObligations.leaseId, leaseId),
  )) as UnpaidObligationRow[];
  return rows.filter((r) => r.status !== 'paid' && r.status !== 'waived');
}

/**
 * Optimistic-concurrency update: writes only when the row still carries
 * `expectedVersion`, and bumps it. Returns null when the version moved (or the
 * row is gone) — the caller turns that into a 409.
 */
export async function updateLeaseIfVersion(
  communityId: number,
  leaseId: number,
  expectedVersion: number,
  values: Record<string, unknown>,
): Promise<LeaseRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.update(
    leases,
    { ...values, version: expectedVersion + 1, updatedAt: new Date() },
    and(eq(leases.id, leaseId), eq(leases.version, expectedVersion)),
  );
  return (rows[0] as unknown as LeaseRow | undefined) ?? null;
}

/** Find a lease created by an earlier submission of the same form. */
export async function findLeaseByIdempotencyKey(
  communityId: number,
  key: string,
): Promise<LeaseRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<LeaseRow>(leases, {}, eq(leases.idempotencyKey, key));
  return rows[0] ?? null;
}

// ── Renewal offers ─────────────────────────────────────────────────────────

export interface RenewalOfferRow {
  [key: string]: unknown;
  id: number;
  leaseId: number;
  stage: 'offer_sent' | 'accepted' | 'declined' | 'expired' | 'signed' | 'withdrawn';
  offerRent: string;
  zeroRentReason: 'staff' | 'courtesy_officer' | 'rent_free_agreement' | 'other' | null;
  termMonths: number | null;
  customEndDate: string | null;
  startDate: string;
  depositAmount: string | null;
  proposedResidents: Array<{ userId: string } | { occupantId: number }> | null;
  sentOn: string;
  expiresOn: string;
  respondedOn: string | null;
  renewalLeaseId: number | null;
}

export async function listRenewalOffers(communityId: number, leaseIds: number[]): Promise<RenewalOfferRow[]> {
  if (leaseIds.length === 0) return [];
  const scoped = createScopedClient(communityId);
  return (await scoped.selectFrom<RenewalOfferRow>(
    leaseRenewalOffers,
    {},
    inArray(leaseRenewalOffers.leaseId, leaseIds),
  )) as RenewalOfferRow[];
}

export async function getRenewalOffer(communityId: number, offerId: number): Promise<RenewalOfferRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<RenewalOfferRow>(leaseRenewalOffers, {}, eq(leaseRenewalOffers.id, offerId));
  return rows[0] ?? null;
}

export async function insertRenewalOffer(
  communityId: number,
  values: Record<string, unknown>,
): Promise<RenewalOfferRow> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(leaseRenewalOffers, values);
  return rows[0] as unknown as RenewalOfferRow;
}

/** Update an offer only while it is still in `fromStage` — a concurrent response loses cleanly. */
export async function updateRenewalOfferFromStage(
  communityId: number,
  offerId: number,
  fromStage: RenewalOfferRow['stage'][],
  values: Record<string, unknown>,
): Promise<RenewalOfferRow | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.update(
    leaseRenewalOffers,
    { ...values, updatedAt: new Date() },
    and(eq(leaseRenewalOffers.id, offerId), inArray(leaseRenewalOffers.stage, fromStage)),
  );
  return (rows[0] as unknown as RenewalOfferRow | undefined) ?? null;
}

/**
 * Close any open offer on a lease that can no longer be renewed (cancelled,
 * deleted, moving out early, transferring). Returns how many were withdrawn.
 */
export async function withdrawOpenOffers(communityId: number, leaseId: number): Promise<number> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.update(
    leaseRenewalOffers,
    { stage: 'withdrawn', updatedAt: new Date() },
    and(eq(leaseRenewalOffers.leaseId, leaseId), inArray(leaseRenewalOffers.stage, ['offer_sent', 'accepted'])),
  );
  return rows.length;
}

// ── Units offline (E7) ─────────────────────────────────────────────────────

export async function setUnitOffline(
  communityId: number,
  unitId: number,
  values: {
    offlineReason: string | null;
    offlineNote: string | null;
    offlineSince: string | null;
    offlineUntil: string | null;
  },
): Promise<{ id: number } | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.update(units, { ...values, updatedAt: new Date() }, eq(units.id, unitId));
  return (rows[0] as unknown as { id: number } | undefined) ?? null;
}

// ── Community lease settings ───────────────────────────────────────────────

/**
 * Merge lease keys into `communities.community_settings` in ONE statement
 * (`||` on jsonb), so a concurrent write to another settings key is never
 * lost to a read-modify-write. COALESCE covers a NULL column.
 */
export async function mergeCommunityLeaseSettings(
  communityId: number,
  patch: { leaseAlertWindows?: number[]; leasesAllowResidentsWithoutEmail?: boolean },
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const scoped = createScopedClient(communityId);
  await scoped.update(communities, {
    communitySettings: sql`COALESCE(${communities.communitySettings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
  });
}
