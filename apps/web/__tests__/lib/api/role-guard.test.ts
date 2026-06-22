import { describe, it, expect } from 'vitest';
import { hasRole, requireRole } from '@/lib/api/role-guard';
import { ForbiddenError } from '@/lib/api/errors';

describe('requireRole', () => {
  const membership = (role: string, presetKey?: string | null) => ({ role, presetKey, communityId: 42 });

  it('allows the caller when their role is in the allowed list', () => {
    expect(() => requireRole(membership('board_president'), ['board_president', 'cam'])).not.toThrow();
  });

  it('throws ForbiddenError when the caller role is not in the allowed list', () => {
    expect(() => requireRole(membership('tenant'), ['board_president', 'cam'])).toThrow(ForbiddenError);
  });

  it('allows property_manager callers when a PM-tier alias is in the allowed list', () => {
    expect(() => requireRole(membership('property_manager'), ['pm_admin', 'cam'])).not.toThrow();
    expect(() => requireRole(membership('root_manager'), ['root_manager'])).not.toThrow();
  });

  it('rejects property_manager callers when the allowed list is not a PM-tier alias', () => {
    expect(() => requireRole(membership('property_manager'), ['cam'])).toThrow(ForbiddenError);
    expect(() => requireRole(membership('property_manager'), ['board_member'])).toThrow(ForbiddenError);
  });

  it('accepts pm_admin when property_manager_admin is in the allowed list (alias expansion)', () => {
    expect(() => requireRole(membership('pm_admin'), ['property_manager_admin'])).not.toThrow();
  });

  it('accepts property_manager_admin when pm_admin is in the allowed list (alias expansion)', () => {
    expect(() => requireRole(membership('property_manager_admin'), ['pm_admin'])).not.toThrow();
  });

  it('rejects a role that is unrelated even when aliases are expanded', () => {
    expect(() => requireRole(membership('owner'), ['pm_admin'])).toThrow(ForbiddenError);
  });

  it('surfaces the custom error message in the thrown ForbiddenError', () => {
    expect(() =>
      requireRole(membership('tenant'), ['board_president'], 'Only board members may do this'),
    ).toThrow('Only board members may do this');
  });
});

describe('hasRole', () => {
  const membership = (role: string, presetKey?: string | null) => ({ role, presetKey, communityId: 42 });

  it('returns true for direct roles and PM-tier aliases', () => {
    expect(hasRole(membership('pm_admin'), ['property_manager_admin'])).toBe(true);
    expect(hasRole(membership('property_manager'), ['pm_admin'])).toBe(true);
  });

  it('returns false instead of throwing when the caller is unauthorized', () => {
    expect(hasRole(membership('resident'), ['pm_admin'])).toBe(false);
    expect(hasRole(membership('property_manager'), ['cam'])).toBe(false);
  });
});
