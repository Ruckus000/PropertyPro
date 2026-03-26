import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  NAV_SECTIONS,
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

describe('NAV_SECTIONS', () => {
  it('exposes the expected section order', () => {
    expect(NAV_SECTIONS.map((section) => section.label)).toEqual([
      null,
      'Community',
      'Management',
      'Admin',
    ]);
  });

  it('keeps dashboard in its own top section', () => {
    expect(NAV_SECTIONS[0].items).toHaveLength(1);
    expect(NAV_SECTIONS[0].items[0].id).toBe('dashboard');
  });

  it('represents each NAV_ITEMS id exactly once across sections', () => {
    const allIds = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.id));
    const uniqueIds = new Set(allIds);

    expect(allIds).toHaveLength(NAV_ITEMS.length);
    expect(uniqueIds.size).toBe(NAV_ITEMS.length);

    for (const item of NAV_ITEMS) {
      expect(allIds.filter((id) => id === item.id)).toHaveLength(1);
    }
  });

  it('only references child item IDs that exist in NAV_ITEMS', () => {
    const allIds = new Set(NAV_ITEMS.map((item) => item.id));

    for (const item of NAV_ITEMS) {
      for (const childId of item.children ?? []) {
        expect(allIds.has(childId)).toBe(true);
        expect(childId).not.toBe(item.id);
      }
    }
  });
});

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

describe('nav href generation', () => {
  it('uses canonical community-scoped paths for primary finance screens', () => {
    const byId = new Map(NAV_ITEMS.map((item) => [item.id, item]));

    expect(byId.get('documents')?.href(42)).toBe('/communities/42/documents');
    expect(byId.get('meetings')?.href(42)).toBe('/communities/42/meetings');
    expect(byId.get('payments')?.href(42)).toBe('/communities/42/payments');
    expect(byId.get('compliance')?.href(42)).toBe('/communities/42/compliance');
    expect(byId.get('assessments')?.href(42)).toBe('/communities/42/assessments');
    expect(byId.get('finance')?.href(42)).toBe('/communities/42/finance');
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

  it('matches canonical finance paths', () => {
    expect(getActiveItemId(NAV_ITEMS, '/communities/1/payments')).toBe('payments');
    expect(getActiveItemId(NAV_ITEMS, '/communities/1/assessments')).toBe('assessments');
    expect(getActiveItemId(NAV_ITEMS, '/communities/1/finance')).toBe('finance');
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
