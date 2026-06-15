import { describe, expect, it } from 'vitest';
import {
  expandHelpViewerRoleAliases,
  resolveHelpViewerRole,
  resolveHelpViewerRoleFromMembership,
} from '../viewer-role';

describe('resolveHelpViewerRole', () => {
  it('maps resident + isUnitOwner to owner/tenant', () => {
    expect(resolveHelpViewerRole('resident', null, true)).toBe('owner');
    expect(resolveHelpViewerRole('resident', null, false)).toBe('tenant');
  });

  it('maps PM-tier DB roles to property_manager_admin', () => {
    expect(resolveHelpViewerRole('pm_admin')).toBe('property_manager_admin');
    expect(resolveHelpViewerRole('root_manager')).toBe('property_manager_admin');
  });

  it('maps property_manager without preset to property_manager_admin', () => {
    expect(resolveHelpViewerRole('property_manager')).toBe('property_manager_admin');
  });

  it('maps manager presets to legacy role names', () => {
    expect(resolveHelpViewerRole('manager', 'cam')).toBe('cam');
    expect(resolveHelpViewerRole('property_manager', 'board_president')).toBe('board_president');
  });

  it('defaults bare manager to cam', () => {
    expect(resolveHelpViewerRole('manager')).toBe('cam');
  });
});

describe('expandHelpViewerRoleAliases', () => {
  it('includes transition aliases for property_manager_admin', () => {
    const aliases = expandHelpViewerRoleAliases('property_manager_admin');
    expect(aliases).toContain('pm_admin');
    expect(aliases).toContain('property_manager');
    expect(aliases).toContain('root_manager');
  });
});

describe('resolveHelpViewerRoleFromMembership', () => {
  it('uses membership fields together', () => {
    expect(
      resolveHelpViewerRoleFromMembership({
        role: 'resident',
        isUnitOwner: true,
      }),
    ).toBe('owner');
  });
});
