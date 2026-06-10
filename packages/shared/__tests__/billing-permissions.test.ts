import { describe, expect, it } from 'vitest';
import {
  canManageBilling,
  canRequestUpgrade,
  getLockedFeatureBehavior,
  inferCanonicalRoleFromMembership,
} from '../src/billing/permissions';
import type { AnyCommunityRole } from '../src/index';

describe('canManageBilling', () => {
  const cases: Array<[AnyCommunityRole | null, boolean]> = [
    [null, false],
    ['owner', false],
    ['tenant', false],
    ['board_member', false],
    ['board_president', true],
    ['cam', true],
    ['site_manager', false],
    ['property_manager_admin', true],
    ['pm_admin', true],
    ['manager', false],
    ['resident', false],
  ];
  it.each(cases)('role=%s → %s', (role, expected) => {
    expect(canManageBilling(role)).toBe(expected);
  });
});

describe('canRequestUpgrade', () => {
  const cases: Array<[AnyCommunityRole | null, boolean]> = [
    [null, false],
    ['tenant', false],
    ['owner', true],
    ['board_member', true],
    ['board_president', true],
    ['cam', true],
    ['site_manager', true],
    ['property_manager_admin', true],
    ['pm_admin', true],
    ['manager', true],
    ['resident', true],
  ];
  it.each(cases)('role=%s → %s', (role, expected) => {
    expect(canRequestUpgrade(role)).toBe(expected);
  });
});

describe('getLockedFeatureBehavior', () => {
  const cases: Array<[AnyCommunityRole | null, 'upgrade' | 'request' | 'hidden']> = [
    [null, 'request'],
    ['tenant', 'hidden'],
    ['owner', 'request'],
    ['board_member', 'request'],
    ['board_president', 'upgrade'],
    ['cam', 'upgrade'],
    ['site_manager', 'request'],
    ['property_manager_admin', 'upgrade'],
    ['pm_admin', 'upgrade'],
    ['manager', 'request'],
    ['resident', 'request'],
  ];
  it.each(cases)('role=%s → %s', (role, expected) => {
    expect(getLockedFeatureBehavior(role)).toBe(expected);
  });
});

describe('inferCanonicalRoleFromMembership — v3 transition values', () => {
  it('maps root_manager to property_manager_admin', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'root_manager' })).toBe('property_manager_admin');
  });
  it('maps presetKey-less property_manager to cam', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager' })).toBe('cam');
  });
  it('keeps preset fidelity for backfilled property_managers', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', presetKey: 'board_member' })).toBe('board_member');
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', presetKey: 'board_president' })).toBe('board_president');
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', presetKey: 'site_manager' })).toBe('site_manager');
  });
  it('does NOT regress v2 behavior', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'pm_admin' })).toBe('property_manager_admin');
    expect(inferCanonicalRoleFromMembership({ role: 'manager', presetKey: 'cam' })).toBe('cam');
    expect(inferCanonicalRoleFromMembership({ role: 'manager' })).toBe('board_member');
    expect(inferCanonicalRoleFromMembership({ role: 'resident', isUnitOwner: true })).toBe('owner');
    expect(inferCanonicalRoleFromMembership({ role: 'resident' })).toBe('tenant');
  });
});

describe('inferCanonicalRoleFromMembership', () => {
  describe('pm_admin role', () => {
    it('always maps to property_manager_admin (presetKey ignored)', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'pm_admin' })).toBe('property_manager_admin');
      expect(inferCanonicalRoleFromMembership({ role: 'pm_admin', presetKey: 'cam' })).toBe('property_manager_admin');
      expect(inferCanonicalRoleFromMembership({ role: 'pm_admin', isUnitOwner: true })).toBe('property_manager_admin');
    });
  });

  describe('manager role with preset keys', () => {
    it.each([
      ['board_president', 'board_president'],
      ['cam', 'cam'],
      ['site_manager', 'site_manager'],
      ['board_member', 'board_member'],
    ])('presetKey=%s → %s', (presetKey, expected) => {
      expect(inferCanonicalRoleFromMembership({ role: 'manager', presetKey })).toBe(expected);
    });

    it('null presetKey defaults to board_member', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'manager', presetKey: null })).toBe('board_member');
    });

    it('unknown presetKey defaults to board_member', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'manager', presetKey: 'mystery' })).toBe('board_member');
    });

    it('missing presetKey defaults to board_member', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'manager' })).toBe('board_member');
    });
  });

  describe('resident role', () => {
    it('isUnitOwner=true → owner', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'resident', isUnitOwner: true })).toBe('owner');
    });

    it('isUnitOwner=false → tenant', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'resident', isUnitOwner: false })).toBe('tenant');
    });

    it('missing isUnitOwner → tenant (conservative default)', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'resident' })).toBe('tenant');
    });
  });

  describe('legacy roles (non-new-model fall-through)', () => {
    it('legacy role with isUnitOwner=true → owner', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'owner', isUnitOwner: true })).toBe('owner');
    });

    it('legacy role without isUnitOwner defaults to tenant', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'board_president' })).toBe('tenant');
    });
  });
});
