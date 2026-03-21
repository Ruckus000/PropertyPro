import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  PM_NAV_ITEMS,
  getVisibleItems,
  getActiveItemId,
  PAGE_TITLES,
} from '../../src/components/layout/nav-config';
import type { CommunityFeatures } from '@propertypro/shared';

const ALL_FEATURES: CommunityFeatures = {
  hasCompliance: true,
  hasStatutoryCategories: true,
  hasMeetings: true,
  hasLeaseTracking: false,
  hasPublicNoticesPage: true,
  hasTransparencyPage: true,
  hasOwnerRole: true,
  hasVoting: true,
  requiresPublicWebsite: true,
  hasMaintenanceRequests: true,
  hasAnnouncements: true,
  hasFinance: true,
  hasViolations: true,
  hasARC: true,
  hasPolls: true,
  hasCommunityBoard: true,
  hasWorkOrders: true,
  hasAmenities: true,
  hasPackageLogging: true,
  hasVisitorLogging: true,
  hasCalendarSync: true,
  hasAccountingConnectors: true,
  hasEsign: true,
  hasEmergencyNotifications: true,
};

const APARTMENT_FEATURES: CommunityFeatures = {
  hasCompliance: false,
  hasStatutoryCategories: false,
  hasMeetings: true,
  hasLeaseTracking: true,
  hasPublicNoticesPage: false,
  hasTransparencyPage: false,
  hasOwnerRole: false,
  hasVoting: false,
  requiresPublicWebsite: false,
  hasMaintenanceRequests: true,
  hasAnnouncements: true,
  hasFinance: true,
  hasViolations: false,
  hasARC: false,
  hasPolls: true,
  hasCommunityBoard: true,
  hasWorkOrders: true,
  hasAmenities: true,
  hasPackageLogging: true,
  hasVisitorLogging: true,
  hasCalendarSync: true,
  hasAccountingConnectors: true,
  hasEsign: true,
  hasEmergencyNotifications: true,
};

describe('getVisibleItems', () => {
  it('shows all main items to owners in condo communities', () => {
    const items = getVisibleItems(NAV_ITEMS, 'owner', ALL_FEATURES);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('dashboard');
    expect(ids).toContain('documents');
    expect(ids).toContain('meetings');
    expect(ids).toContain('announcements');
    expect(ids).toContain('maintenance');
  });

  it('hides admin items from owners', () => {
    const items = getVisibleItems(NAV_ITEMS, 'owner', ALL_FEATURES);
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain('compliance');
    expect(ids).not.toContain('maintenance-inbox');
    expect(ids).not.toContain('contracts');
    expect(ids).not.toContain('audit-trail');
  });

  it('shows admin items to board members', () => {
    const items = getVisibleItems(NAV_ITEMS, 'board_member', ALL_FEATURES);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('compliance');
    expect(ids).toContain('maintenance-inbox');
    expect(ids).toContain('contracts');
    expect(ids).toContain('audit-trail');
  });

  it('hides feature-gated items when feature is disabled', () => {
    const items = getVisibleItems(NAV_ITEMS, 'board_member', APARTMENT_FEATURES);
    const ids = items.map((i) => i.id);
    // Apartments have meetings, so it should be visible
    expect(ids).toContain('meetings');
    // Apartments don't have compliance or violations
    expect(ids).not.toContain('compliance');
    expect(ids).not.toContain('contracts');
    expect(ids).not.toContain('report-violation');
    expect(ids).not.toContain('violations-inbox');
  });

  it('shows all items when role/features are null', () => {
    const items = getVisibleItems(NAV_ITEMS, null, null);
    expect(items.length).toBe(NAV_ITEMS.length);
  });
});

describe('getActiveItemId', () => {
  it('matches dashboard pathname', () => {
    expect(getActiveItemId(NAV_ITEMS, '/dashboard')).toBe('dashboard');
    expect(getActiveItemId(NAV_ITEMS, '/dashboard/apartment')).toBe('dashboard');
  });

  it('matches documents pathname', () => {
    expect(getActiveItemId(NAV_ITEMS, '/communities/1/documents')).toBe('documents');
    expect(getActiveItemId(NAV_ITEMS, '/documents')).toBe('documents');
  });

  it('matches maintenance paths distinctly', () => {
    expect(getActiveItemId(NAV_ITEMS, '/maintenance/submit')).toBe('maintenance');
    expect(getActiveItemId(NAV_ITEMS, '/maintenance/inbox')).toBe('maintenance-inbox');
  });

  it('matches PM paths', () => {
    expect(getActiveItemId(PM_NAV_ITEMS, '/pm/dashboard/communities')).toBe('communities');
    expect(getActiveItemId(PM_NAV_ITEMS, '/pm/settings/branding')).toBe('branding');
  });

  it('returns null for unmatched paths', () => {
    expect(getActiveItemId(NAV_ITEMS, '/unknown')).toBeNull();
  });
});

describe('PAGE_TITLES', () => {
  it('has entries for all nav item IDs', () => {
    for (const item of NAV_ITEMS) {
      expect(PAGE_TITLES[item.id]).toBeDefined();
    }
  });

  it('has entries for PM nav item IDs', () => {
    for (const item of PM_NAV_ITEMS) {
      expect(PAGE_TITLES[item.id]).toBeDefined();
    }
  });
});
