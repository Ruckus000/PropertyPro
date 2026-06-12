import { describe, expect, it } from 'vitest';
import {
  ADMIN_TIER_DB_ROLES,
  MANAGER_TIER_DB_ROLES,
  PM_SCOPE_DB_ROLES,
  TRANSITION_ROLES,
  expandTransitionRoleFilter,
  hasBoardDesignation,
  isBoardPresident,
} from '../src/role-transition';

describe('role-transition constants', () => {
  // Contract-pin tests: they catch accidental constant mutation across the bilingual window, not logic.
  it('TRANSITION_ROLES carries both generations', () => {
    expect(TRANSITION_ROLES).toEqual(['resident', 'manager', 'pm_admin', 'property_manager', 'root_manager']);
  });
  it('ADMIN_TIER includes every manager-or-above value of both generations', () => {
    expect(ADMIN_TIER_DB_ROLES).toEqual(['manager', 'pm_admin', 'property_manager', 'root_manager']);
  });
  it('PM_SCOPE covers pm_admin and its v3 successors', () => {
    expect(PM_SCOPE_DB_ROLES).toEqual(['pm_admin', 'property_manager', 'root_manager']);
  });
  it('MANAGER_TIER covers manager and its v3 successors', () => {
    expect(MANAGER_TIER_DB_ROLES).toEqual(['manager', 'property_manager', 'root_manager']);
  });
});

describe('expandTransitionRoleFilter', () => {
  it('expands v2 filter values to match rows of both generations', () => {
    expect(expandTransitionRoleFilter('manager')).toEqual(['manager', 'property_manager', 'root_manager']);
    expect(expandTransitionRoleFilter('pm_admin')).toEqual(['pm_admin', 'property_manager', 'root_manager']);
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
