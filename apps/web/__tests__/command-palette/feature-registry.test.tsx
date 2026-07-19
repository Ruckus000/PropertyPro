import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { RBAC_RESOURCES } from '@propertypro/shared';
import {
  roleMatchesRegistryItem,
  useFilteredRegistry,
} from '../../src/lib/constants/feature-registry';

function buildAccess(overrides: Partial<Record<string, { read: boolean; write: boolean }>> = {}) {
  return Object.fromEntries(
    RBAC_RESOURCES.map((resource) => [
      resource,
      overrides[resource] ?? { read: true, write: true },
    ]),
  ) as never;
}

describe('roleMatchesRegistryItem', () => {
  it('admits the management tier to admin-gated entries', () => {
    expect(roleMatchesRegistryItem('property_manager', 'admin')).toBe(true);
    expect(roleMatchesRegistryItem('root_manager', 'admin')).toBe(true);
  });

  it('admits every role to all-gated entries', () => {
    expect(roleMatchesRegistryItem('resident', 'all')).toBe(true);
    expect(roleMatchesRegistryItem('property_manager', 'all')).toBe(true);
  });

  it('denies residents on admin-gated entries', () => {
    expect(roleMatchesRegistryItem('resident', 'admin')).toBe(false);
  });

  it('owner_or_admin admits unit owners and the management tier, not tenants', () => {
    expect(roleMatchesRegistryItem('resident', 'owner_or_admin', true)).toBe(true); // owner
    expect(roleMatchesRegistryItem('resident', 'owner_or_admin', false)).toBe(false); // tenant
    expect(roleMatchesRegistryItem('property_manager', 'owner_or_admin')).toBe(true);
  });
});

describe('useFilteredRegistry', () => {
  it('hides read-gated pages for managers without resource access', () => {
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'property_manager',
        {
          hasMeetings: true,
          hasMaintenanceRequests: true,
          hasViolations: true,
        } as never,
        42,
        buildAccess({
          announcements: { read: false, write: true },
          meetings: { read: false, write: true },
          maintenance: { read: false, write: true },
        }),
      ),
    );

    const ids = result.current.map((item) => item.id);
    expect(ids).not.toContain('page-announcements');
    expect(ids).not.toContain('page-meetings');
    expect(ids).not.toContain('page-maintenance');
  });

  it('hides write-gated quick actions when a manager cannot mutate that resource', () => {
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'property_manager',
        {
          hasMeetings: true,
        } as never,
        42,
        buildAccess({
          announcements: { read: true, write: false },
          meetings: { read: true, write: false },
          documents: { read: true, write: false },
        }),
      ),
    );

    const ids = result.current.map((item) => item.id);
    expect(ids).not.toContain('action-post-announcement');
    expect(ids).not.toContain('action-schedule-meeting');
    expect(ids).not.toContain('action-upload-document');
  });

  it('resolves the post announcement quick action to the routed create page', () => {
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'property_manager',
        {
          hasMeetings: true,
        } as never,
        42,
        buildAccess({
          announcements: { read: true, write: true },
        }),
      ),
    );

    const postAnnouncement = result.current.find((item) => item.id === 'action-post-announcement');
    expect(postAnnouncement?.href).toBe('/announcements/new?communityId=42');
  });

  it('shows admin-gated nav entries to a property_manager membership (user_role_v2 value)', () => {
    // Regression: ADMIN_ROLES holds legacy role names, but membership.role is
    // the user_role_v2 enum value ('property_manager'). A bare includes() check
    // treated every manager as a resident and hid admin entries.
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'property_manager',
        {
          hasCompliance: true,
          hasViolations: true,
          hasFinance: true,
        } as never,
        42,
        buildAccess(),
      ),
    );

    const ids = result.current.map((item) => item.id);
    // admin-audience pages (roles: 'admin')
    expect(ids).toContain('page-compliance');
    expect(ids).toContain('page-violations-inbox');
    // admin-audience quick action (roles: 'admin')
    expect(ids).toContain('action-upload-document');
    // finance read (roles: 'owner_or_admin') — management tier qualifies
    expect(ids).toContain('page-payments');
  });

  it('shows admin-gated nav entries to a root_manager membership (user_role_v2 value)', () => {
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'root_manager',
        {
          hasCompliance: true,
        } as never,
        42,
        buildAccess(),
      ),
    );

    const ids = result.current.map((item) => item.id);
    expect(ids).toContain('page-compliance');
    expect(ids).toContain('action-upload-document');
  });

  it('still hides admin-gated nav entries from a resident membership', () => {
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'resident',
        {
          hasCompliance: true,
          hasViolations: true,
        } as never,
        42,
        buildAccess(),
      ),
    );

    const ids = result.current.map((item) => item.id);
    expect(ids).not.toContain('page-compliance');
    expect(ids).not.toContain('page-violations-inbox');
    expect(ids).not.toContain('action-upload-document');
    // resident still sees audience: 'all' entries
    expect(ids).toContain('page-dashboard');
  });

  it('resolves the announcements page entry to the scoped announcements list', () => {
    const { result } = renderHook(() =>
      useFilteredRegistry(
        'property_manager',
        {
          hasMeetings: true,
        } as never,
        42,
        buildAccess({
          announcements: { read: true, write: true },
        }),
      ),
    );

    const announcementsPage = result.current.find((item) => item.id === 'page-announcements');
    expect(announcementsPage?.href).toBe('/announcements?communityId=42');
  });
});
