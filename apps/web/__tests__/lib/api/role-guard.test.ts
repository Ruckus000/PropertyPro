import { describe, it, expect } from 'vitest';
import {
  hasRole,
  requireRole,
  requireRootManager,
  PM_MANAGER_ROLES,
} from '@/lib/api/role-guard';
import { ForbiddenError } from '@/lib/api/errors';

// v3 (ADR-006): stored roles are `resident` / `property_manager` / `root_manager`.
// Gating on `property_manager` also admits `root_manager` (root is a superset of
// the operational manager tier); a `root_manager`-only gate is stricter.

describe('requireRole', () => {
  const membership = (role: string) => ({ role, communityId: 42 });

  it('allows the caller when their role is in the allowed list', () => {
    expect(() => requireRole(membership('property_manager'), PM_MANAGER_ROLES)).not.toThrow();
    expect(() => requireRole(membership('root_manager'), PM_MANAGER_ROLES)).not.toThrow();
  });

  it('throws ForbiddenError when the caller role is not in the allowed list', () => {
    expect(() => requireRole(membership('resident'), PM_MANAGER_ROLES)).toThrow(ForbiddenError);
  });

  it('admits root_manager when the gate is property_manager (root is a superset)', () => {
    expect(() => requireRole(membership('root_manager'), ['property_manager'])).not.toThrow();
  });

  it('does not admit property_manager when the gate is root_manager only', () => {
    expect(() => requireRole(membership('property_manager'), ['root_manager'])).toThrow(ForbiddenError);
  });

  it('rejects an unrelated role', () => {
    expect(() => requireRole(membership('resident'), ['property_manager'])).toThrow(ForbiddenError);
  });

  it('surfaces the custom error message in the thrown ForbiddenError', () => {
    expect(() =>
      requireRole(membership('resident'), PM_MANAGER_ROLES, 'Only property managers may do this'),
    ).toThrow('Only property managers may do this');
  });
});

// ADR-006 §2 / role-v3 R3-03: the four root-exclusive powers (role assignment,
// billing/subscription, community deletion, root transfer) gate on this guard.
// `settings:write` CANNOT express it — the RBAC matrix collapses
// property_manager and root_manager onto one `manager` row.
describe('requireRootManager', () => {
  const membership = (role: string) => ({ role, communityId: 42 });

  it('admits root_manager', () => {
    expect(() => requireRootManager(membership('root_manager'))).not.toThrow();
  });

  it('rejects property_manager — the whole point of the narrowing', () => {
    expect(() => requireRootManager(membership('property_manager'))).toThrow(ForbiddenError);
  });

  it('rejects residents', () => {
    expect(() => requireRootManager(membership('resident'))).toThrow(ForbiddenError);
  });

  it('names the claim-root recovery path in the default message', () => {
    // A property manager in a root-vacant community is the legitimate way to hit
    // this; a bare 403 would leave them with no way forward.
    expect(() => requireRootManager(membership('property_manager'))).toThrow(/claim it from the dashboard/);
  });

  it('surfaces a caller-supplied message', () => {
    expect(() =>
      requireRootManager(membership('property_manager'), 'Only the root manager can manage roles.'),
    ).toThrow('Only the root manager can manage roles.');
  });
});

describe('hasRole', () => {
  const membership = (role: string) => ({ role, communityId: 42 });

  it('returns true when the caller role satisfies the gate', () => {
    expect(hasRole(membership('property_manager'), PM_MANAGER_ROLES)).toBe(true);
    expect(hasRole(membership('root_manager'), ['property_manager'])).toBe(true);
  });

  it('returns false instead of throwing when the caller is unauthorized', () => {
    expect(hasRole(membership('resident'), PM_MANAGER_ROLES)).toBe(false);
    expect(hasRole(membership('property_manager'), ['root_manager'])).toBe(false);
  });
});
