import { describe, expect, it } from 'vitest';
import {
  isRoleAllowedForCommunityType,
  isUnitRequiredForRole,
  validateRoleAssignment,
} from '../../src/lib/utils/role-validator';

describe('p1-18 role validator (v3)', () => {
  it('allows every v3 role in every community type', () => {
    expect(isRoleAllowedForCommunityType('resident', 'apartment')).toBe(true);
    expect(isRoleAllowedForCommunityType('property_manager', 'apartment')).toBe(true);
    expect(isRoleAllowedForCommunityType('root_manager', 'condo_718')).toBe(true);
  });

  it('requires a unit assignment only for residents', () => {
    expect(isUnitRequiredForRole('resident')).toBe(true);
    expect(isUnitRequiredForRole('property_manager')).toBe(false);
    expect(isUnitRequiredForRole('root_manager')).toBe(false);
  });

  it('returns invalid when a resident is missing the required unit', () => {
    const result = validateRoleAssignment('resident', 'condo_718', null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('requires a unit assignment');
  });

  it('returns valid for a manager tier without a unit', () => {
    expect(validateRoleAssignment('property_manager', 'hoa_720', null).valid).toBe(true);
    expect(validateRoleAssignment('root_manager', 'apartment', null).valid).toBe(true);
  });

  it('returns valid when a resident has a unit assigned', () => {
    const result = validateRoleAssignment('resident', 'condo_718', 42);
    expect(result.valid).toBe(true);
  });
});
