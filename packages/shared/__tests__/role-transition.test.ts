import { describe, expect, it } from 'vitest';
import { COMMUNITY_ROLES } from '../src/index';
import { isAdminRole } from '../src/access-policies';
import {
  ADMIN_TIER_DB_ROLES,
  MANAGER_TIER_DB_ROLES,
  PM_SCOPE_DB_ROLES,
  expandTransitionRoleFilter,
  hasBoardDesignation,
  isBoardPresident,
} from '../src/role-transition';

describe('role-transition constants', () => {
  // Contract-pin tests: they catch accidental constant mutation, not logic.
  it('COMMUNITY_ROLES is the v3-only set', () => {
    expect(COMMUNITY_ROLES).toEqual(['resident', 'property_manager', 'root_manager']);
  });
  it('ADMIN_TIER includes the v3 manager-or-above values', () => {
    expect(ADMIN_TIER_DB_ROLES).toEqual(['property_manager', 'root_manager']);
  });
  it('PM_SCOPE covers the v3 manager-tier roles', () => {
    expect(PM_SCOPE_DB_ROLES).toEqual(['property_manager', 'root_manager']);
  });
  it('MANAGER_TIER covers the v3 manager-tier roles', () => {
    expect(MANAGER_TIER_DB_ROLES).toEqual(['property_manager', 'root_manager']);
  });
});

describe('admin-tier idioms agree (roadmap 2.1: pin, don\u2019t drain)', () => {
  // Route authz reads "is this a manager?" through several idioms:
  // membership.isAdmin (ADMIN_TIER_DB_ROLES), isAdminRole (the matrix `manager`
  // row via resolveMatrixRole), requireRole(PM_MANAGER_ROLES) (PM_SCOPE_DB_ROLES)
  // and billing's isManagementTier (ADMIN_TIER_DB_ROLES). They are only safe to
  // leave un-unified while they agree for every role — this is that pin.
  it.each(COMMUNITY_ROLES)('%s: every idiom gives the same answer', (role) => {
    const adminTier = (ADMIN_TIER_DB_ROLES as readonly string[]).includes(role);
    expect(isAdminRole(role)).toBe(adminTier);
    expect((PM_SCOPE_DB_ROLES as readonly string[]).includes(role)).toBe(adminTier);
  });
});

describe('expandTransitionRoleFilter', () => {
  it('returns [] for retired legacy filter values (manager / pm_admin)', () => {
    expect(expandTransitionRoleFilter('manager')).toEqual([]);
    expect(expandTransitionRoleFilter('pm_admin')).toEqual([]);
  });
  it('passes v3 and resident values through unchanged', () => {
    expect(expandTransitionRoleFilter('resident')).toEqual(['resident']);
    expect(expandTransitionRoleFilter('property_manager')).toEqual(['property_manager']);
    expect(expandTransitionRoleFilter('root_manager')).toEqual(['root_manager']);
  });
  it('returns [] for unknown values (callers must short-circuit before inArray)', () => {
    expect(expandTransitionRoleFilter('owner')).toEqual([]);
  });
});

describe('hasBoardDesignation', () => {
  it('accepts both board designations', () => {
    expect(hasBoardDesignation('board_president')).toBe(true);
    expect(hasBoardDesignation('board_member')).toBe(true);
  });
  it('rejects null, undefined, and non-board strings', () => {
    expect(hasBoardDesignation(null)).toBe(false);
    expect(hasBoardDesignation(undefined)).toBe(false);
    expect(hasBoardDesignation('')).toBe(false);
    expect(hasBoardDesignation('cam')).toBe(false);
    expect(hasBoardDesignation('president')).toBe(false);
    expect(hasBoardDesignation(7)).toBe(false);
  });
});

describe('isBoardPresident', () => {
  it('is true only for board_president', () => {
    expect(isBoardPresident('board_president')).toBe(true);
    expect(isBoardPresident('board_member')).toBe(false);
    expect(isBoardPresident(null)).toBe(false);
    expect(isBoardPresident(undefined)).toBe(false);
    expect(isBoardPresident(['board_president'])).toBe(false);
    expect(isBoardPresident({})).toBe(false);
  });
});
