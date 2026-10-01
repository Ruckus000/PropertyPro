import { units, userRoles, type ScopedClient } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { ForbiddenError } from '@/lib/api/errors';

/**
 * List all unit IDs associated with a user (via role assignments + ownership).
 * Canonical implementation — all domain modules should import from here.
 */
export async function listActorUnitIds(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number[]> {
  const [membershipRows, ownedUnitRows] = await Promise.all([
    scopedClient.selectFrom<{ unitId: number | null }>(
      userRoles,
      { unitId: userRoles.unitId },
      eq(userRoles.userId, actorUserId),
    ),
    scopedClient.selectFrom<{ id: number }>(
      units,
      { id: units.id },
      eq(units.ownerUserId, actorUserId),
    ),
  ]);

  const unitIds = new Set<number>();

  for (const row of membershipRows) {
    if (typeof row.unitId === 'number' && Number.isFinite(row.unitId)) {
      unitIds.add(row.unitId);
    }
  }

  for (const row of ownedUnitRows) {
    if (typeof row.id === 'number' && Number.isFinite(row.id)) {
      unitIds.add(row.id);
    }
  }

  return [...unitIds];
}

/**
 * Every resident (owners and tenants) of a unit: resident role assignments on
 * the unit, plus the unit's recorded owner — `user_roles.unit_id` holds one
 * unit per membership, so an owner of several units appears only via
 * `units.owner_user_id`. The inverse of listActorUnitIds.
 */
export async function listUnitResidentUserIds(
  scopedClient: ScopedClient,
  unitId: number,
): Promise<string[]> {
  const [residentRows, unitRows] = await Promise.all([
    scopedClient.selectFrom<{ userId: string }>(
      userRoles,
      { userId: userRoles.userId },
      and(eq(userRoles.unitId, unitId), eq(userRoles.role, 'resident')),
    ),
    scopedClient.selectFrom<{ ownerUserId: string | null }>(
      units,
      { ownerUserId: units.ownerUserId },
      eq(units.id, unitId),
    ),
  ]);
  const userIds = new Set(residentRows.map((row) => row.userId));
  for (const row of unitRows) if (row.ownerUserId) userIds.add(row.ownerUserId);
  return [...userIds];
}

/** Alias for listActorUnitIds — used by domain modules. */
export const getActorUnitIds = listActorUnitIds;

/** Requires at least one unit association, returns the first unit ID. */
export async function requireActorUnitId(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number> {
  const unitIds = await listActorUnitIds(scopedClient, actorUserId);
  const firstUnitId = unitIds[0];
  if (firstUnitId === undefined) {
    throw new ForbiddenError('No unit association found for this user in the selected community');
  }
  return firstUnitId;
}
