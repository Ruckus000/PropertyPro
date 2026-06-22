/**
 * Unit tests for role-validator.ts — specifically the new isResidentTierRole predicate
 * that locks the residents create/update path to resident-tier roles only.
 */
import { describe, expect, it } from 'vitest';
import {
  isResidentTierRole,
  validateRoleAssignment,
} from '../../src/lib/utils/role-validator';

describe('isResidentTierRole', () => {
  it('returns true for resident', () => {
    expect(isResidentTierRole('resident')).toBe(true);
  });

  it('returns false for property_manager', () => {
    expect(isResidentTierRole('property_manager')).toBe(false);
  });

  it('returns false for root_manager', () => {
    expect(isResidentTierRole('root_manager')).toBe(false);
  });
});

describe('validateRoleAssignment (sanity)', () => {
  it('returns valid for resident with a unit in condo_718', () => {
    const result = validateRoleAssignment('resident', 'condo_718', 1);
    expect(result.valid).toBe(true);
  });

  it('returns invalid for resident without a unit', () => {
    const result = validateRoleAssignment('resident', 'condo_718', null);
    expect(result.valid).toBe(false);
  });
});
