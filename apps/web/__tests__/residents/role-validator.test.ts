import { describe, expect, it } from 'vitest';
import {
  isRoleAllowedForCommunityType,
  isUnitRequiredForRole,
  validateRoleAssignment,
} from '../../src/lib/utils/role-validator';

describe('p1-18 role validator', () => {
  it('allows apartment-supported roles and rejects condo-only roles', () => {
    expect(isRoleAllowedForCommunityType('tenant', 'apartment')).toBe(true);
    expect(isRoleAllowedForCommunityType('owner', 'apartment')).toBe(false);
  });

  it('requires unit assignment for owner and tenant', () => {
    expect(isUnitRequiredForRole('owner')).toBe(true);
    expect(isUnitRequiredForRole('tenant')).toBe(true);
    expect(isUnitRequiredForRole('board_member')).toBe(false);
  });

  it('returns invalid for disallowed role/community combinations', () => {
    const result = validateRoleAssignment('board_member', 'apartment', null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('returns invalid when required unit is missing', () => {
    const result = validateRoleAssignment('owner', 'condo_718', null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('requires a unit assignment');
  });

  it('returns valid when role and unit policy are satisfied', () => {
    const result = validateRoleAssignment('board_president', 'hoa_720', null);
    expect(result.valid).toBe(true);
  });
});
