import { describe, expect, it, vi } from 'vitest';

// Mock @propertypro/db so the module can be imported without a built package
vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  onboardingChecklistItems: Symbol('onboardingChecklistItems'),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
}));

import {
  getItemKeysForRole,
  PM_ADMIN_ITEMS,
  BOARD_MEMBER_ITEMS,
  OWNER_TENANT_ITEMS,
  ADMIN_CONDO_ITEMS,
  ADMIN_APARTMENT_ITEMS,
} from '../../../src/lib/services/onboarding-checklist-service';

describe('getItemKeysForRole — v3 role + designation resolution', () => {
  it('board_member designation → BOARD_MEMBER_ITEMS', () => {
    const keys = getItemKeysForRole('resident', 'board_member', 'condo_718');
    expect(keys).toEqual([...BOARD_MEMBER_ITEMS]);
  });

  it('board_president designation → admin base (condo)', () => {
    const keys = getItemKeysForRole('resident', 'board_president', 'condo_718');
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS]);
    expect(keys).not.toContain('customize_portal');
  });

  it('board_president designation → admin base (apartment)', () => {
    const keys = getItemKeysForRole('resident', 'board_president', 'apartment');
    expect(keys).toEqual([...ADMIN_APARTMENT_ITEMS]);
  });

  it('root_manager (no designation) → admin base + PM_ADMIN_ITEMS', () => {
    const keys = getItemKeysForRole('root_manager', null, 'condo_718');
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS, ...PM_ADMIN_ITEMS]);
    expect(keys).toContain('customize_portal');
  });

  it('pm_admin (no designation) → admin base + PM_ADMIN_ITEMS', () => {
    const keys = getItemKeysForRole('pm_admin', null, 'apartment');
    expect(keys).toEqual([...ADMIN_APARTMENT_ITEMS, ...PM_ADMIN_ITEMS]);
    expect(keys).toContain('customize_portal');
  });

  it('property_manager (no designation, PM scope) → admin base + PM_ADMIN_ITEMS', () => {
    const keys = getItemKeysForRole('property_manager', null, 'condo_718');
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS, ...PM_ADMIN_ITEMS]);
    expect(keys).toContain('customize_portal');
  });

  // DOCUMENTED behavior change (role-v3 Phase 3.3): the legacy site_manager —
  // a manager-tier v3 role with no board designation — previously resolved to
  // the display string 'site_manager' and fell through to the owner/tenant
  // checklist. Keyed on the v3 role, a bare manager now receives the admin base
  // set. Onboarding-only; no permission or data change.
  it('manager (no designation, ex-site_manager) → admin base, no customize_portal', () => {
    const keys = getItemKeysForRole('manager', null, 'condo_718');
    expect(keys).toEqual([...ADMIN_CONDO_ITEMS]);
    expect(keys).not.toContain('customize_portal');
  });

  it('resident (no designation) → OWNER_TENANT_ITEMS', () => {
    const keys = getItemKeysForRole('resident', null, 'condo_718');
    expect(keys).toEqual([...OWNER_TENANT_ITEMS]);
  });

  it('resident (no designation) → OWNER_TENANT_ITEMS regardless of community type', () => {
    const keys = getItemKeysForRole('resident', null, 'apartment');
    expect(keys).toEqual([...OWNER_TENANT_ITEMS]);
  });
});
