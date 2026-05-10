import type { createScopedClient } from '@propertypro/db';
import { units, userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

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
 * Fetch a unit by unit number inside the caller's scoped community. Used for
 * duplicate checks; caller decides whether a match conflicts with the current
 * operation.
 */
export async function getUnitByNumber(
  scoped: ScopedClient,
  unitNumber: string,
): Promise<UnitRouteRow | null> {
  const rows = await scoped.selectFrom(
    units,
    {},
    eq(units.unitNumber, unitNumber),
  );
  return ((rows as unknown as UnitRouteRow[])[0]) ?? null;
}

/**
 * Insert a unit in the caller's scoped community. Caller MUST verify units:write
 * authorization and duplicate unit-number policy before calling.
 */
export async function createUnitForCommunity(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<UnitRouteRow | undefined> {
  const rows = await scoped.insert(units, values);
  return (rows as unknown as UnitRouteRow[])[0];
}

/**
 * Update a unit by id inside the caller's scoped community. Caller MUST verify
 * units:write authorization and build a validated update payload.
 */
export async function updateUnitById(
  scoped: ScopedClient,
  unitId: number,
  values: Record<string, unknown>,
): Promise<void> {
  await scoped.update(units, values, eq(units.id, unitId));
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
 * Soft-delete a unit inside the caller's scoped community. Caller MUST verify
 * units:write authorization and ensure no resident roles are assigned.
 */
export async function softDeleteUnitById(
  scoped: ScopedClient,
  unitId: number,
): Promise<void> {
  await scoped.softDelete(units, eq(units.id, unitId));
}
