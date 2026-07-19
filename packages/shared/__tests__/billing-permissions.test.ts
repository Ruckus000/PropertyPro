import { describe, expect, it } from 'vitest';
import {
  canManageBilling,
  canRequestUpgrade,
  getLockedFeatureBehavior,
} from '../src/billing/permissions';
import type { AnyCommunityRole } from '../src/index';

// v3 role model (ADR-006): the billing helpers key ONLY on the runtime role
// (`resident` / `property_manager` / `root_manager`) plus `isUnitOwner` to split
// owner from tenant. `designation` is NEVER an input — a board seat cannot
// change a member's billing capability (this is the R3-04 fix; the removed
// bridge shim let a `board_member` designation strip a manager's billing-admin).

describe('canManageBilling', () => {
  const cases: Array<[AnyCommunityRole | null, boolean]> = [
    [null, false],
    ['resident', false],
    ['property_manager', true],
    ['root_manager', true],
  ];
  it.each(cases)('role=%s → %s', (role, expected) => {
    expect(canManageBilling(role)).toBe(expected);
  });

  it('R3-04: management tier keeps billing-admin regardless of any board seat', () => {
    // There is no designation parameter, so a property_manager who also holds a
    // board designation still manages billing — the shim bug is structurally
    // impossible now.
    expect(canManageBilling('property_manager')).toBe(true);
    expect(canManageBilling('root_manager')).toBe(true);
  });
});

describe('canRequestUpgrade', () => {
  it('management tier and unit owners can request; tenants cannot', () => {
    expect(canRequestUpgrade('property_manager')).toBe(true);
    expect(canRequestUpgrade('root_manager')).toBe(true);
    expect(canRequestUpgrade('resident', true)).toBe(true); // owner
    expect(canRequestUpgrade('resident', false)).toBe(false); // tenant
    expect(canRequestUpgrade('resident')).toBe(false); // no isUnitOwner → tenant
    expect(canRequestUpgrade(null)).toBe(false);
  });
});

describe('getLockedFeatureBehavior', () => {
  it('management tier → upgrade, unit owner → request, tenant → hidden', () => {
    expect(getLockedFeatureBehavior('property_manager')).toBe('upgrade');
    expect(getLockedFeatureBehavior('root_manager')).toBe('upgrade');
    expect(getLockedFeatureBehavior('resident', true)).toBe('request'); // owner
    expect(getLockedFeatureBehavior('resident', false)).toBe('hidden'); // tenant
    expect(getLockedFeatureBehavior('resident')).toBe('hidden'); // no isUnitOwner → tenant
    expect(getLockedFeatureBehavior(null)).toBe('request');
  });
});
