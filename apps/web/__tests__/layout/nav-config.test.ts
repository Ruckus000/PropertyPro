import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  NAV_SECTIONS,
  PM_NAV_ITEMS,
  getVisibleItems,
  getActiveItemId,
  resolveDashboardHref,
  resolveNavItemHref,
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

// HOA (§720) feature shape — packages and visitors are NOT included.
// Locks in the existing nav gating so a regression flips to a stale-link state.
const HOA_FEATURES: CommunityFeatures = {
  ...ALL_FEATURES,
  hasPackageLogging: false,
  hasVisitorLogging: false,
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
  it('shows all main items to residents in condo communities', () => {
    const items = getVisibleItems(NAV_ITEMS, 'resident', ALL_FEATURES, true);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('dashboard');
    expect(ids).toContain('documents');
    expect(ids).toContain('meetings');
    expect(ids).toContain('announcements');
    expect(ids).toContain('board');
    expect(ids).toContain('operations');
  });

  it('hides admin items from residents', () => {
    const items = getVisibleItems(NAV_ITEMS, 'resident', ALL_FEATURES, true);
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain('compliance');
    expect(ids).not.toContain('contracts');
    expect(ids).not.toContain('audit-trail');
  });

  it('shows payments to unit owners but hides it from tenants (finance dead-end)', () => {
    const owner = getVisibleItems(NAV_ITEMS, 'resident', ALL_FEATURES, true).map((i) => i.id);
    const tenant = getVisibleItems(NAV_ITEMS, 'resident', ALL_FEATURES, false).map((i) => i.id);
    expect(owner).toContain('payments');
    expect(tenant).not.toContain('payments');
  });

  it('shows admin items to the management tier', () => {
    const items = getVisibleItems(NAV_ITEMS, 'property_manager', ALL_FEATURES);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('compliance');
    expect(ids).toContain('contracts');
    expect(ids).toContain('audit-trail');
  });

  it('hides feature-gated items when feature is disabled', () => {
    const items = getVisibleItems(NAV_ITEMS, 'property_manager', APARTMENT_FEATURES);
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

  it('hides packages and visitors for HOA communities (regression)', () => {
    // hasPackageLogging=false at the community-type layer must hide the
    // packages nav item entirely so users do not click into a guard state
    // they cannot resolve. Same for visitors.
    const items = getVisibleItems(NAV_ITEMS, 'property_manager', HOA_FEATURES);
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain('packages');
    expect(ids).not.toContain('visitors');
  });

  it('shows the Website (site editor) launcher to the management tier only', () => {
    // The editor route is management-tier, so the community-sidebar launcher is
    // gated the same way — never a dead link. `designation` is orthogonal
    // (ADR-006): a resident who holds a board seat still does not see it.
    const withEditor = { ...ALL_FEATURES, hasSiteEditor: true };
    expect(getVisibleItems(NAV_ITEMS, 'property_manager', withEditor).map((i) => i.id)).toContain('website');
    expect(getVisibleItems(NAV_ITEMS, 'root_manager', withEditor).map((i) => i.id)).toContain('website');
    // Residents (owner or tenant) never see it, even with the feature on.
    expect(getVisibleItems(NAV_ITEMS, 'resident', withEditor, true).map((i) => i.id)).not.toContain('website');
    expect(getVisibleItems(NAV_ITEMS, 'resident', withEditor, false).map((i) => i.id)).not.toContain('website');
  });

  it('hides the Website launcher when the plan lacks the site editor', () => {
    const noEditor = { ...ALL_FEATURES, hasSiteEditor: false };
    expect(getVisibleItems(NAV_ITEMS, 'property_manager', noEditor).map((i) => i.id)).not.toContain('website');
  });
});

describe('nav href generation', () => {
  it('uses canonical community-scoped paths for primary finance screens', () => {
    const byId = new Map(NAV_ITEMS.map((item) => [item.id, item]));

    expect(byId.get('documents')?.href(42)).toBe('/communities/42/documents');
    expect(byId.get('meetings')?.href(42)).toBe('/communities/42/meetings');
    expect(byId.get('payments')?.href(42)).toBe('/communities/42/payments');
    expect(byId.get('compliance')?.href(42)).toBe('/communities/42/compliance');
  });

  it('never targets a compatibility redirect bridge page', () => {
    // Top-level bridge stubs that immediately server-redirect to
    // /communities/:id/... — one click must not cost two route loads.
    const bridgePathnames = ['/documents', '/payments', '/finance', '/assessments'];

    for (const item of [...NAV_ITEMS, ...PM_NAV_ITEMS]) {
      const pathname = item.href(42).split('?')[0];
      expect(
        bridgePathnames.includes(pathname),
        `nav item "${item.id}" links to redirect bridge ${pathname}`,
      ).toBe(false);
    }
  });
});

describe('resolveDashboardHref', () => {
  it('links lease-tracking communities straight to the apartment dashboard', () => {
    expect(
      resolveDashboardHref(42, { ...ALL_FEATURES, hasLeaseTracking: true }),
    ).toBe('/dashboard/apartment?communityId=42');
  });

  it('links non-lease communities to the generic dashboard', () => {
    expect(resolveDashboardHref(42, ALL_FEATURES)).toBe('/dashboard?communityId=42');
  });

  it('falls back to the generic dashboard when features are unknown', () => {
    expect(resolveDashboardHref(42, null)).toBe('/dashboard?communityId=42');
  });
});

describe('resolveNavItemHref', () => {
  it('resolves every PM item to its real /pm/... destination when communityId is null', () => {
    // Regression: the PM portal renders with community = null (cross-community
    // context, no tenant header), and the old sidebar logic sent EVERY PM nav
    // item to the /select-community fallback — a fully dead PM nav.
    for (const item of PM_NAV_ITEMS) {
      const href = resolveNavItemHref(item, null, true);
      expect(href, `PM item "${item.id}"`).toBe(item.href(0));
      expect(href.startsWith('/pm/'), `PM item "${item.id}" resolves to ${href}`).toBe(true);
    }
  });

  it('keeps the community-scoped href when communityId is present', () => {
    const documents = NAV_ITEMS.find((item) => item.id === 'documents')!;
    expect(resolveNavItemHref(documents, 42, false)).toBe('/communities/42/documents');
  });

  it('falls back to the community picker for community items without tenant context', () => {
    const documents = NAV_ITEMS.find((item) => item.id === 'documents')!;
    expect(resolveNavItemHref(documents, null, false)).toBe('/select-community');
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

  it('matches canonical payments path', () => {
    expect(getActiveItemId(NAV_ITEMS, '/communities/1/payments')).toBe('payments');
  });

  it('distinguishes admin violations inbox from violation report path', () => {
    expect(getActiveItemId(NAV_ITEMS, '/violations/report')).toBe('violations-report');
    expect(getActiveItemId(NAV_ITEMS, '/violations')).toBe('violations-inbox');
  });

  it('matches board and operations paths', () => {
    expect(getActiveItemId(NAV_ITEMS, '/communities/1/board/polls')).toBe('board');
    expect(getActiveItemId(NAV_ITEMS, '/communities/1/operations')).toBe('operations');
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
