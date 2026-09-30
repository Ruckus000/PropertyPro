import { describe, expect, it, vi } from 'vitest';
import type { ScopedClient } from '@propertypro/db';

const { units, userRoles } = vi.hoisted(() => ({
  units: { id: Symbol('units.id'), ownerUserId: Symbol('units.owner_user_id') },
  userRoles: { userId: Symbol('user_roles.user_id'), unitId: Symbol('user_roles.unit_id'), role: Symbol('user_roles.role') },
}));
vi.mock('@propertypro/db', () => ({ units, userRoles }));

const { listUnitResidentUserIds } = await import('../actor-units');

describe('listUnitResidentUserIds', () => {
  it('unions the unit’s resident roles with its recorded owner, once each', async () => {
    const selectFrom = vi.fn(async (table: unknown) =>
      table === userRoles
        ? [{ userId: 'owner-1' }, { userId: 'tenant-1' }]
        : table === units
          ? [{ ownerUserId: 'owner-1' }, { ownerUserId: null }]
          : [],
    );
    const ids = await listUnitResidentUserIds({ selectFrom } as unknown as ScopedClient, 9);
    expect(ids.sort()).toEqual(['owner-1', 'tenant-1']);
  });

  it('includes an owner who is linked to the unit only through units.owner_user_id', async () => {
    const selectFrom = vi.fn(async (table: unknown) => (table === units ? [{ ownerUserId: 'multi-unit-owner' }] : []));
    expect(await listUnitResidentUserIds({ selectFrom } as unknown as ScopedClient, 9)).toEqual(['multi-unit-owner']);
  });
});
