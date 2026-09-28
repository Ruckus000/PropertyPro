import { describe, expect, it } from 'vitest';
import { getVisibleItems, NAV_ITEMS } from '@/components/layout/nav-config';
import { roleMatchesRegistryItem } from '@/lib/constants/feature-registry';
import { matchesRoleVisibility } from '../role-visibility';

/**
 * Roadmap 2.9 / INF-02: the sidebar and the command palette share ONE role
 * gate. Revert-check: restore nav-config's old `if (!role) return true` and the
 * "no role" sidebar case goes red — that was the one input the two copies
 * disagreed on.
 */
const VIEWERS = [
  { name: 'no role', role: null, isUnitOwner: undefined },
  { name: 'tenant', role: 'resident', isUnitOwner: false },
  { name: 'owner', role: 'resident', isUnitOwner: true },
  { name: 'property manager', role: 'property_manager', isUnitOwner: false },
  { name: 'root manager', role: 'root_manager', isUnitOwner: false },
] as const;

describe('matchesRoleVisibility', () => {
  it('fails closed for a gated item when there is no role', () => {
    expect(matchesRoleVisibility('all', null)).toBe(true);
    expect(matchesRoleVisibility('admin', null)).toBe(false);
    expect(matchesRoleVisibility('owner_or_admin', null, true)).toBe(false);
  });

  it('admits management to admin items and owners to owner_or_admin items only', () => {
    expect(matchesRoleVisibility('admin', 'property_manager')).toBe(true);
    expect(matchesRoleVisibility('admin', 'resident', true)).toBe(false);
    expect(matchesRoleVisibility('owner_or_admin', 'resident', true)).toBe(true);
    expect(matchesRoleVisibility('owner_or_admin', 'resident', false)).toBe(false);
  });
});

describe('sidebar and palette agree (the parity INF-02 is about)', () => {
  it.each(VIEWERS)('$name: every nav item is shown exactly when the shared gate says so', (viewer) => {
    const shown = new Set(
      getVisibleItems(NAV_ITEMS, viewer.role, null, viewer.isUnitOwner).map((i) => i.id),
    );
    for (const item of NAV_ITEMS) {
      const expected = matchesRoleVisibility(item.visibility ?? 'all', viewer.role, viewer.isUnitOwner);
      expect([item.id, shown.has(item.id)]).toEqual([item.id, expected]);
    }
  });

  it.each(VIEWERS.filter((v) => v.role !== null))(
    '$name: the registry gate gives the same answer as the nav gate for every visibility',
    (viewer) => {
      for (const gate of ['all', 'admin', 'owner_or_admin'] as const) {
        expect(roleMatchesRegistryItem(viewer.role!, gate, viewer.isUnitOwner)).toBe(
          matchesRoleVisibility(gate, viewer.role, viewer.isUnitOwner),
        );
      }
    },
  );
});
