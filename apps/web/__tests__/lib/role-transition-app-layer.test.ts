import { describe, expect, it } from 'vitest';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { hasRole } from '@/lib/api/role-guard';
import { isAdminRole } from '@propertypro/shared';

describe('checkPermissionV2 — v3 transition roles', () => {
  it('root_manager resolves the property_manager_admin matrix row', () => {
    expect(checkPermissionV2('root_manager', 'condo_718', 'documents', 'write')).toBe(
      checkPermissionV2('pm_admin', 'condo_718', 'documents', 'write'),
    );
  });
  it('property_manager uses JSONB permissions like manager', () => {
    const permissions = { resources: { documents: { read: true, write: false } } } as never;
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'read', { permissions })).toBe(true);
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'write', { permissions })).toBe(false);
  });
  it('property_manager without permissions is denied (matches manager behavior)', () => {
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'read')).toBe(false);
  });
});

describe('hasRole — v3 transition aliases', () => {
  it('accepts property_manager and root_manager rows where pm_admin is allowed', () => {
    expect(hasRole({ role: 'property_manager', communityId: 1 }, ['pm_admin'])).toBe(true);
    expect(hasRole({ role: 'root_manager', communityId: 1 }, ['pm_admin'])).toBe(true);
  });
  it('matches manager-preset allowlists for property_manager rows (backfill keeps presetKey)', () => {
    expect(hasRole({ role: 'property_manager', communityId: 1, presetKey: 'cam' }, ['cam'])).toBe(true);
  });
  it('does not regress v2 behavior', () => {
    expect(hasRole({ role: 'manager', communityId: 1, presetKey: 'cam' }, ['cam'])).toBe(true);
    expect(hasRole({ role: 'resident', communityId: 1 }, ['pm_admin'])).toBe(false);
  });
});

describe('isAdminRole — v3 transition roles', () => {
  it('treats v3 manager-tier roles as admin', () => {
    expect(isAdminRole('property_manager' as never)).toBe(true);
    expect(isAdminRole('root_manager' as never)).toBe(true);
  });
  it('does not regress v2 behavior', () => {
    expect(isAdminRole('manager')).toBe(true);
    expect(isAdminRole('pm_admin')).toBe(true);
    expect(isAdminRole('tenant')).toBe(false);
  });
});
