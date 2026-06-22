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
  it('maps designation-less property_manager to cam', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager' })).toBe('cam');
  });
  it('resolves board designation for property_managers', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', designation: 'board_member' })).toBe('board_member');
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', designation: 'board_president' })).toBe('board_president');
  });
  it('maps residents by unit ownership', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'resident', isUnitOwner: true })).toBe('owner');
    expect(inferCanonicalRoleFromMembership({ role: 'resident' })).toBe('tenant');
  });
});

describe('inferCanonicalRoleFromMembership', () => {
  describe('root_manager role', () => {
    it('always maps to property_manager_admin', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'root_manager' })).toBe('property_manager_admin');
      expect(inferCanonicalRoleFromMembership({ role: 'root_manager', isUnitOwner: true })).toBe('property_manager_admin');
      expect(inferCanonicalRoleFromMembership({ role: 'root_manager', designation: 'board_member' })).toBe('property_manager_admin');
    });
  });

  describe('property_manager role with board designation', () => {
    it.each([
      ['board_president', 'board_president'],
      ['board_member', 'board_member'],
    ])('designation=%s → %s', (designation, expected) => {
      expect(inferCanonicalRoleFromMembership({ role: 'property_manager', designation })).toBe(expected);
    });

    it('null designation defaults to cam', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'property_manager', designation: null })).toBe('cam');
    });

    it('missing designation defaults to cam', () => {
      expect(inferCanonicalRoleFromMembership({ role: 'property_manager' })).toBe('cam');
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

describe('inferCanonicalRoleFromMembership — designation precedence (3.2)', () => {
  it('resolves board designation for property_manager rows', () => {
    expect(inferCanonicalRoleFromMembership({
      role: 'property_manager', designation: 'board_president',
    })).toBe('board_president');
    expect(inferCanonicalRoleFromMembership({
      role: 'property_manager', designation: 'board_member',
    })).toBe('board_member');
  });
  it('default branches are untouched (LOAD-BEARING: prod null-designation rows)', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', designation: null })).toBe('cam');
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager' })).toBe('cam');
    expect(inferCanonicalRoleFromMembership({ role: 'root_manager', designation: 'board_president' })).toBe('property_manager_admin');
    expect(inferCanonicalRoleFromMembership({ role: 'resident', isUnitOwner: true, designation: 'board_member' })).toBe('owner');
  });
});
