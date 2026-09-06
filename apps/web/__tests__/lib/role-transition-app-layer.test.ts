import { describe, expect, it } from 'vitest';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { hasRole } from '@/lib/api/role-guard';
import { isAdminRole } from '@propertypro/shared';

describe('checkPermissionV2 — v3 transition roles', () => {
  it('root_manager resolves the property_manager_admin matrix row', () => {
    expect(checkPermissionV2('root_manager', 'condo_718', 'documents', 'write')).toBe(
      checkPermissionV2('pm_admin' as never, 'condo_718', 'documents', 'write'),
    );
  });
  it('resident (owner or tenant) is read-only for documents:write — the gate used by upload/delete (#734)', () => {
    // The documents route gates upload AND delete on documents:write via this
    // function; residents must not write/delete documents regardless of unit ownership.
    expect(checkPermissionV2('resident', 'condo_718', 'documents', 'write', { isUnitOwner: true })).toBe(false);
    expect(checkPermissionV2('resident', 'condo_718', 'documents', 'write', { isUnitOwner: false })).toBe(false);
    expect(checkPermissionV2('resident', 'condo_718', 'documents', 'read', { isUnitOwner: true })).toBe(true);
  });
  it('property_manager resolves the property_manager_admin matrix (uniform widening)', () => {
    // Reads AND writes resolve from the matrix.
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'read')).toBe(
      checkPermissionV2('pm_admin' as never, 'condo_718', 'documents', 'read'),
    );
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'write')).toBe(
      checkPermissionV2('pm_admin' as never, 'condo_718', 'documents', 'write'),
    );
    expect(checkPermissionV2('property_manager', 'condo_718', 'finances', 'write')).toBe(
      checkPermissionV2('pm_admin' as never, 'condo_718', 'finances', 'write'),
    );
    // The matrix grants these.
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'read')).toBe(true);
    expect(checkPermissionV2('property_manager', 'condo_718', 'finances', 'write')).toBe(true);
  });
});

describe('hasRole — v3 transition roles', () => {
  it('accepts the management tier where the PM tier is allowed', () => {
    expect(hasRole({ role: 'property_manager', communityId: 1 }, ['property_manager'])).toBe(true);
    // root is a superset of the operational manager tier.
    expect(hasRole({ role: 'root_manager', communityId: 1 }, ['property_manager'])).toBe(true);
    expect(hasRole({ role: 'root_manager', communityId: 1 }, ['root_manager'])).toBe(true);
  });
  it('enforces the stricter root-only gate', () => {
    expect(hasRole({ role: 'property_manager', communityId: 1 }, ['root_manager'])).toBe(false);
  });
  it('rejects residents', () => {
    expect(hasRole({ role: 'resident', communityId: 1 }, ['property_manager'])).toBe(false);
  });
});

describe('isAdminRole — v3 transition roles', () => {
  it('treats v3 manager-tier roles as admin', () => {
    expect(isAdminRole('property_manager' as never)).toBe(true);
    expect(isAdminRole('root_manager' as never)).toBe(true);
  });
  it('treats residents as non-admin', () => {
    expect(isAdminRole('resident' as never)).toBe(false);
    expect(isAdminRole('tenant' as never)).toBe(false);
  });
});
