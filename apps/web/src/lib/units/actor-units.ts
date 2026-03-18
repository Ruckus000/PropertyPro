import { units, userRoles, type ScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
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
