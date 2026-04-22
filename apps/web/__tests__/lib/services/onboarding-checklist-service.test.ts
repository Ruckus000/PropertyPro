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

import { getItemKeysForRole } from '../../../src/lib/services/onboarding-checklist-service';

describe('getItemKeysForRole — customize_portal scoping', () => {
  it('includes customize_portal for pm_admin on a condo community', () => {
    const keys = getItemKeysForRole('pm_admin', 'condo_718');
    expect(keys).toContain('customize_portal');
  });

  it('includes customize_portal for property_manager_admin on an apartment community', () => {
    const keys = getItemKeysForRole('property_manager_admin', 'apartment');
    expect(keys).toContain('customize_portal');
  });

  it('does NOT include customize_portal for cam', () => {
    const keys = getItemKeysForRole('cam', 'condo_718');
    expect(keys).not.toContain('customize_portal');
  });

  it('does NOT include customize_portal for board_president', () => {
    const keys = getItemKeysForRole('board_president', 'condo_718');
    expect(keys).not.toContain('customize_portal');
  });

  it('does NOT include customize_portal for manager', () => {
    const keys = getItemKeysForRole('manager', 'apartment');
    expect(keys).not.toContain('customize_portal');
  });
});
