import { describe, expect, it } from 'vitest';
import {
  canManageBilling,
  canRequestUpgrade,
  canViewBilling,
  getLockedFeatureBehavior,
} from '../src/billing/permissions';
import type { CommunityRole } from '../src/index';

// v3 role model (ADR-006): the billing helpers key ONLY on the runtime role
// (`resident` / `property_manager` / `root_manager`) plus `isUnitOwner` to split
// owner from tenant. `designation` is NEVER an input — a board seat cannot
// change a member's billing capability (this is the R3-04 fix; the removed
// bridge shim let a `board_member` designation strip a manager's billing-admin).
//
// R3-03 narrowed the ACTION half to the root manager: billing/subscription is
// one of ADR-006's four root-exclusive powers. A property manager keeps VIEW
// (`canViewBilling`) and the request path, but cannot purchase.

describe('canManageBilling', () => {
  const cases: Array<[CommunityRole | null, boolean]> = [
    [null, false],
    ['resident', false],
    ['property_manager', false],
    ['root_manager', true],
  ];
  it.each(cases)('role=%s → %s', (role, expected) => {
    expect(canManageBilling(role)).toBe(expected);
  });

  it('R3-03: a property manager cannot manage billing', () => {
    // The whole point of the narrowing — a PM must not be able to move the
    // community's money. The server-side fence is `requireRootManager`.
    expect(canManageBilling('property_manager')).toBe(false);
  });

  it('R3-04: the root manager keeps billing-admin regardless of any board seat', () => {
    // There is still no designation parameter, so a root_manager who also holds
    // a board designation manages billing exactly as one who does not — the
    // shim bug remains structurally impossible. R3-03 changed WHICH role holds
    // the power, not whether designation can strip it.
    expect(canManageBilling('root_manager')).toBe(true);
  });
});

describe('canViewBilling', () => {
  it('the whole management tier keeps read access; residents never get it', () => {
    // A PM losing the actions must NOT lose sight of the subscription —
    // hiding it would make the capability loss invisible.
    expect(canViewBilling('property_manager')).toBe(true);
    expect(canViewBilling('root_manager')).toBe(true);
    expect(canViewBilling('resident')).toBe(false);
    expect(canViewBilling(null)).toBe(false);
  });

  it('view is strictly broader than manage', () => {
    expect(canViewBilling('property_manager')).toBe(true);
    expect(canManageBilling('property_manager')).toBe(false);
  });
});

describe('canRequestUpgrade', () => {
  it('management tier and unit owners can request; tenants cannot', () => {
    // Unchanged by R3-03 — a PM who can no longer purchase must still be able
    // to ask the root manager, or the narrowing would be a dead end.
    expect(canRequestUpgrade('property_manager')).toBe(true);
    expect(canRequestUpgrade('root_manager')).toBe(true);
    expect(canRequestUpgrade('resident', true)).toBe(true); // owner
    expect(canRequestUpgrade('resident', false)).toBe(false); // tenant
    expect(canRequestUpgrade('resident')).toBe(false); // no isUnitOwner → tenant
    expect(canRequestUpgrade(null)).toBe(false);
  });
});

describe('getLockedFeatureBehavior', () => {
  it('root → upgrade, PM and unit owner → request, tenant → hidden', () => {
    expect(getLockedFeatureBehavior('root_manager')).toBe('upgrade');
    expect(getLockedFeatureBehavior('property_manager')).toBe('request');
    expect(getLockedFeatureBehavior('resident', true)).toBe('request'); // owner
    expect(getLockedFeatureBehavior('resident', false)).toBe('hidden'); // tenant
    expect(getLockedFeatureBehavior('resident')).toBe('hidden'); // no isUnitOwner → tenant
    expect(getLockedFeatureBehavior(null)).toBe('request');
  });

  it('R3-03: a PM gets the request CTA, never a dead-end upgrade button', () => {
    // 'upgrade' would render a purchase CTA that 403s at the route.
    expect(getLockedFeatureBehavior('property_manager')).not.toBe('upgrade');
  });
});
