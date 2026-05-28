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

  it('allows manager callers when their presetKey is in the allowed list', () => {
    expect(() => requireRole(membership('manager', 'cam'), ['pm_admin', 'cam'])).not.toThrow();
    expect(() => requireRole(membership('manager', 'board_president'), ['board_president'])).not.toThrow();
  });

  it('rejects manager callers when their presetKey is missing or unrelated', () => {
    expect(() => requireRole(membership('manager', null), ['cam'])).toThrow(ForbiddenError);
    expect(() => requireRole(membership('manager', 'board_member'), ['cam'])).toThrow(ForbiddenError);
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

  it('returns true for direct roles, aliases, and manager preset roles', () => {
    expect(hasRole(membership('pm_admin'), ['property_manager_admin'])).toBe(true);
    expect(hasRole(membership('manager', 'cam'), ['cam'])).toBe(true);
  });

  it('returns false instead of throwing when the caller is unauthorized', () => {
    expect(hasRole(membership('resident'), ['pm_admin'])).toBe(false);
    expect(hasRole(membership('manager', 'board_member'), ['cam'])).toBe(false);
  });
});
