import type { createScopedClient } from '@propertypro/db';
import { getUnitLedgerBalance, units, userRoles, violations } from '@propertypro/db';
import { fence } from '@propertypro/db/optimistic-concurrency';
import { and, eq, notInArray, sql } from '@propertypro/db/filters';
import { ConflictError } from '@/lib/api/errors';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';

type ScopedClient = ReturnType<typeof createScopedClient>;

export type UnitRouteRow = Record<string, unknown>;

/**
 * List units in the caller's scoped community. Caller MUST verify units:read
 * authorization before exposing the rows.
 */
export async function listUnitsForCommunity(scoped: ScopedClient): Promise<UnitRouteRow[]> {
  return (await scoped.query(units)) as UnitRouteRow[];
}

/**
 * Fetch a unit by id inside the caller's scoped community. Replaces route-side
 * full-table fetches plus JS `.find()` for point lookups.
 */
export async function getUnitById(
  scoped: ScopedClient,
  unitId: number,
): Promise<UnitRouteRow | null> {
  const rows = await scoped.selectFrom(
    units,
    {},
    eq(units.id, unitId),
  );
  return ((rows as unknown as UnitRouteRow[])[0]) ?? null;
}

/**
 * Fetch a unit by unit number inside the caller's scoped community,
 * case-insensitively — the same rule as the `units_community_unit_number_unique`
 * index and the resident CSV import's lookup. Used for duplicate checks; caller
 * decides whether a match conflicts with the current operation.
 */
export async function getUnitByNumber(
  scoped: ScopedClient,
  unitNumber: string,
): Promise<UnitRouteRow | null> {
  const rows = await scoped.selectFrom(
    units,
    {},
    sql`lower(${units.unitNumber}) = lower(${unitNumber})`,
  );
  return ((rows as unknown as UnitRouteRow[])[0]) ?? null;
}

const UNIT_NUMBER_UNIQUE = 'units_community_unit_number_unique';

/** A live unit already has this number (any letter case). */
export function unitNumberTaken(unitNumber: string): ConflictError {
  return new ConflictError(`Unit number "${unitNumber}" already exists in this community`);
}

/** The unique index is the arbiter when two writes race past the pre-check. */
async function withUnitNumberConflict<T>(unitNumber: unknown, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isNamedUniqueViolation(error, UNIT_NUMBER_UNIQUE)) throw unitNumberTaken(String(unitNumber));
    throw error;
  }
}

/**
 * Insert a unit in the caller's scoped community. Caller MUST verify units:write
 * authorization. A duplicate number is a 409 (`unitNumberTaken`).
 */
export async function createUnitForCommunity(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<UnitRouteRow | undefined> {
  const rows = await withUnitNumberConflict(values['unitNumber'], () => scoped.insert(units, values));
  return (rows as unknown as UnitRouteRow[])[0];
}

/**
 * Update a unit by id inside the caller's scoped community. Caller MUST verify
 * units:write authorization and build a validated update payload.
 *
 * `expectedUpdatedAt` (optimistic concurrency): the `updatedAt` the caller last
 * read. The write applies only if the row is unchanged since; returns null
 * when it is not (someone else saved in between). Compared at millisecond
 * precision — what JSON carries — since `defaultNow()` stores microseconds.
 * Returns the updated row otherwise.
 *
 * Both halves of that come from `fence()`: the comparison AND the new
 * timestamp, which has to strictly advance or a stale token keeps matching. See
 * `optimistic-concurrency.ts` — taking one without the other is the bug it
 * exists to prevent.
 */
export async function updateUnitById(
  scoped: ScopedClient,
  unitId: number,
  values: Record<string, unknown>,
  expectedUpdatedAt?: string,
): Promise<UnitRouteRow | null> {
  const guard = fence(units.updatedAt, expectedUpdatedAt);
  const where =
    guard.where === undefined ? eq(units.id, unitId) : and(eq(units.id, unitId), guard.where);
  // `updatedAt` last: it must win over anything the caller put in `values`.
  const rows = await withUnitNumberConflict(values['unitNumber'], () =>
    scoped.update(units, { ...values, updatedAt: guard.updatedAt }, where),
  );
  return ((rows as unknown as UnitRouteRow[])[0]) ?? null;
}

/**
 * List active resident-role assignments for a unit inside the caller's scoped
 * community. Caller MUST verify units:write authorization before delete checks.
 */
export async function listResidentRolesForUnit(
  scoped: ScopedClient,
  unitId: number,
): Promise<UnitRouteRow[]> {
  const rows = await scoped.selectFrom(
    userRoles,
    {},
    eq(userRoles.unitId, unitId),
  );
  return rows as unknown as UnitRouteRow[];
}

/**
 * Unit ledger balance in cents (charges minus payments). Non-zero either way —
 * owed or in credit — blocks unit deletion: soft-deleting the unit would
 * orphan money the association still has to collect or refund.
 */
export async function getUnitBalanceCents(scoped: ScopedClient, unitId: number): Promise<number> {
  return getUnitLedgerBalance(scoped, unitId);
}

const openViolation = () => notInArray(violations.status, ['resolved', 'dismissed']);

/** Violations on the unit that are still in progress (not resolved/dismissed). */
export async function countOpenViolationsForUnit(scoped: ScopedClient, unitId: number): Promise<number> {
  return (await countOpenViolationsByUnit(scoped, unitId)).get(unitId) ?? 0;
}

/**
 * Open (not resolved/dismissed) violation counts per unit, for the whole
 * community in one query — the Directory shows a count on every card, so a
 * per-unit call would be N+1. Units with none are absent from the map.
 */
export async function countOpenViolationsByUnit(
  scoped: ScopedClient,
  onlyUnitId?: number,
): Promise<Map<number, number>> {
  const rows = await scoped.selectFrom<{ unitId: number }>(
    violations,
    { unitId: violations.unitId },
    onlyUnitId === undefined ? openViolation() : and(eq(violations.unitId, onlyUnitId), openViolation()),
  );
  const counts = new Map<number, number>();
  for (const { unitId } of rows) counts.set(unitId, (counts.get(unitId) ?? 0) + 1);
  return counts;
}

/**
 * Soft-delete a unit inside the caller's scoped community. Caller MUST verify
 * units:write authorization and ensure no resident roles are assigned.
 */
export async function softDeleteUnitById(
  scoped: ScopedClient,
  unitId: number,
): Promise<void> {
  await scoped.softDelete(units, eq(units.id, unitId));
}
