import { describe, expect, it } from 'vitest';
import {
  ADMIN_TIER_DB_ROLES,
  MANAGER_TIER_DB_ROLES,
  PM_SCOPE_DB_ROLES,
  TRANSITION_ROLES,
  expandTransitionRoleFilter,
} from '../src/role-transition';

describe('role-transition constants', () => {
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
