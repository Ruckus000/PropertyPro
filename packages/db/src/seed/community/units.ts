/** Units per community type, and linking each seeded resident role to its unit. */
import { and, asc, eq, isNull, sql } from '../../filters';
import { leases, units } from '../../schema';
import { db, debugSeed } from './context';
import type { SeedRole } from './types';

/**
 * Seed units for a community — idempotent (skips existing units).
 * Shared by both condo/HOA and apartment seeding paths.
 */
async function seedUnits(
  communityId: number,
  unitNumbers: string[],
): Promise<{ unitIds: number[]; unitNumbers: string[] }> {
  const existing = await db
    .select({ id: units.id, unitNumber: units.unitNumber })
    .from(units)
    .where(eq(units.communityId, communityId));

  const existingByNumber = new Map(existing.map((u) => [u.unitNumber, u.id]));
  const unitIds: number[] = [];

  // Collect units that need to be inserted
  const toInsert = unitNumbers.filter((un) => !existingByNumber.has(un));
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(units)
      .values(toInsert.map((unitNumber) => ({ communityId, unitNumber })))
      .returning({ id: units.id, unitNumber: units.unitNumber });

    for (const row of inserted) {
      existingByNumber.set(row.unitNumber, row.id);
    }
  }

  // Return IDs in the same order as the input unitNumbers
  for (const un of unitNumbers) {
    unitIds.push(existingByNumber.get(un)!);
  }

  return { unitIds, unitNumbers };
}

export function seedCondoHoaUnits(communityId: number) {
  return seedUnits(communityId, ['1A', '1B', '2A', '2B', '3A', '3B']);
}

export function seedApartmentUnits(communityId: number) {
  return seedUnits(communityId, [
    '101A', '101B', 'PH-1', 'PH-2',
    '101', '102', '103', '104', '105', '106',
    '201', '202', '203', '204', '205', '206',
    '301', '302', '303', '304', '305', '306',
    '401', '402', '403', '404',
  ]);
}

/**
 * Give every seeded resident the unit the product requires of them
 * (`UNIT_REQUIRED_ROLES` in apps/web role-validator). App paths always write
 * `user_roles.unit_id`; the seed used to leave it NULL, so demo residents fell
 * through every unit-scoped feature that resolves units via `listActorUnitIds`.
 *
 *  - tenant: the unit of their ACTIVE lease (lowest lease id wins). A tenant
 *    with no lease is left as-is — a condo tenant has no lease here, and the
 *    caller (scripts/seed-demo.ts) links that persona explicitly.
 *  - owner: the unit they already own (`units.owner_user_id`), lowest unit
 *    number first. If they own none, claim the lowest-numbered UNOWNED unit —
 *    setting `units.owner_user_id` and the role's `unit_id` together, the
 *    same shape seed-demo.ts uses for owner.one. Never takes another owner's
 *    unit.
 *
 * Every write is scoped by `community_id` AND `user_id`. Idempotent: a reseed
 * finds the same lease / owned unit and writes the same value.
 */
export async function linkSeededResidentUnits(
  communityId: number,
  residents: Array<{ userId: string; role: SeedRole }>,
): Promise<void> {
  for (const resident of residents) {
    let unitId: number | null = null;

    if (resident.role === 'tenant') {
      const [lease] = await db
        .select({ unitId: leases.unitId })
        .from(leases)
        .where(
          and(
            eq(leases.communityId, communityId),
            eq(leases.residentId, resident.userId),
            eq(leases.status, 'active'),
            isNull(leases.deletedAt),
          ),
        )
        .orderBy(asc(leases.id))
        .limit(1);
      unitId = lease?.unitId ?? null;
    } else if (resident.role === 'owner') {
      const [owned] = await db
        .select({ id: units.id })
        .from(units)
        .where(
          and(
            eq(units.communityId, communityId),
            eq(units.ownerUserId, resident.userId),
            isNull(units.deletedAt),
          ),
        )
        .orderBy(asc(units.unitNumber))
        .limit(1);
      if (owned) {
        unitId = owned.id;
      } else {
        const [unowned] = await db
          .select({ id: units.id })
          .from(units)
          .where(
            and(
              eq(units.communityId, communityId),
              isNull(units.ownerUserId),
              isNull(units.deletedAt),
            ),
          )
          .orderBy(asc(units.unitNumber))
          .limit(1);
        if (unowned) {
          await db.transaction(async (tx) => {
            await tx
              .update(units)
              .set({ ownerUserId: resident.userId, updatedAt: new Date() })
              .where(and(eq(units.id, unowned.id), eq(units.communityId, communityId)));
            await tx.execute(sql`
              update user_roles
              set unit_id = ${unowned.id}, updated_at = now()
              where community_id = ${communityId}
                and user_id = ${resident.userId}
            `);
          });
          debugSeed(`owner ${resident.userId} claimed unit ${unowned.id}`);
          continue;
        }
      }
    }

    if (unitId == null) {
      continue;
    }

    await db.execute(sql`
      update user_roles
      set unit_id = ${unitId}, updated_at = now()
      where community_id = ${communityId}
        and user_id = ${resident.userId}
    `);
  }
}
