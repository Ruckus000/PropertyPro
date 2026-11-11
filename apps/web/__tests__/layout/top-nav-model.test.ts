import { describe, expect, it, vi } from 'vitest';
import {
  getEffectiveFeatures,
  type CommunityRole,
  type CommunityType,
  type PlanId,
} from '@propertypro/shared';
import {
  NAV_ITEMS,
  NAV_SECTIONS,
  buildSlimNavSections,
  getVisibleItemsWithPlanGate,
} from '../../src/components/layout/nav-config';
import {
  buildTopNavModel,
  type TopNavInput,
  type TopNavModel,
} from '../../src/components/layout/top-nav-model';

const NO_BADGES = { pendingJoinRequests: 0, missingRecords: 0 };

function input(overrides: Partial<TopNavInput> & {
  role?: CommunityRole;
  communityType?: CommunityType;
  planId?: PlanId | null;
} = {}): TopNavInput {
  const communityType = overrides.communityType ?? 'condo_718';
  const planId = overrides.planId === undefined ? 'professional' : overrides.planId;
  return {
    pathname: '/dashboard',
    search: null,
    communityId: 7,
    role: 'root_manager',
    isUnitOwner: false,
    features: getEffectiveFeatures(communityType, planId ?? 'essentials'),
    communityType,
    planId,
    lapsedAdmin: false,
    badges: NO_BADGES,
    ...overrides,
  };
}

const tabIds = (m: TopNavModel) => m.tabs.map((t) => t.id);
const moreIds = (m: TopNavModel) => m.moreGroups.flatMap((g) => g.links.map((l) => l.id));

/** What the rail's own helpers say, for the same viewer. */
function expectedSplit(i: TopNavInput) {
  const visible = getVisibleItemsWithPlanGate(
    NAV_ITEMS,
    i.role,
    i.features,
    i.communityType,
    i.planId,
    i.isUnitOwner,
    i.lapsedAdmin,
  );
  const visibleById = new Map(visible.map((item) => [item.id, item] as const));
  const sections = buildSlimNavSections(visibleById, NAV_SECTIONS);
  return {
    visibleIds: visible.map((v) => v.id),
    tabIds: sections.filter((s) => s.label !== 'More').flatMap((s) => s.items.map((x) => x.id)),
    moreIds: sections.find((s) => s.label === 'More')?.items.map((x) => x.id) ?? [],
  };
}

describe('buildTopNavModel', () => {
  it('professional manager gets Dashboard, Documents, Meetings, Announcements, Website, Compliance, Directory as tabs', () => {
    const i = input();
    const model = buildTopNavModel(i);
    // Section order (what the rail shows), derived from nav-config rather than
    // restated here.
    expect(tabIds(model)).toEqual(expectedSplit(i).tabIds);
    for (const id of [
      'dashboard',
      'documents',
      'meetings',
      'announcements',
      'website',
      'compliance',
      'directory',
    ]) {
      expect(tabIds(model)).toContain(id);
    }
    // Tab order follows NAV_SECTIONS: Management's Website sits before Admin's Compliance.
    expect(tabIds(model).indexOf('website')).toBeLessThan(tabIds(model).indexOf('compliance'));
  });

  it('tenant tabs have no admin items', () => {
    const model = buildTopNavModel(input({ role: 'resident', isUnitOwner: false }));
    const all = [...tabIds(model), ...moreIds(model)];
    const adminOnly = NAV_ITEMS.filter((n) => n.visibility === 'admin').map((n) => n.id);
    expect(adminOnly.length).toBeGreaterThan(0);
    for (const id of adminOnly) expect(all).not.toContain(id);
    expect(tabIds(model)).toContain('dashboard');
  });

  it('every visible item is reachable, exactly once, with children as their own links', () => {
    for (const communityType of ['condo_718', 'apartment'] as const) {
      const i = input({ communityType, planId: communityType === 'apartment' ? 'operations_plus' : 'professional' });
      const model = buildTopNavModel(i);
      const all = [...tabIds(model), ...moreIds(model)];
      expect(new Set(all).size).toBe(all.length);
      expect([...all].sort()).toEqual([...expectedSplit(i).visibleIds].sort());
    }
    // The children surface as links in More.
    const apartment = buildTopNavModel(input({ communityType: 'apartment', planId: 'operations_plus' }));
    expect(moreIds(apartment)).toContain('move-in-out');
    expect(moreIds(buildTopNavModel(input()))).toContain('violations-inbox');
  });

  it('groups More under the NAV_SECTIONS labels, in order, dropping empty groups', () => {
    const model = buildTopNavModel(input());
    const labels = model.moreGroups.map((g) => g.label);
    const order = NAV_SECTIONS.map((s) => s.label).filter((l): l is string => l !== null);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).toEqual(order.filter((l) => labels.includes(l)));
    for (const group of model.moreGroups) expect(group.links.length).toBeGreaterThan(0);
    // 'Community' holds Board/Operations/Insurance...; ids stay under the section that lists them.
    const community = model.moreGroups.find((g) => g.label === 'Community');
    expect(community?.links.map((l) => l.id)).toContain('board');
  });

  it('plan-locked items stay, flagged, with the upgrade fields', () => {
    const i = input({ planId: 'essentials', role: 'property_manager' });
    const model = buildTopNavModel(i);
    const locked = [...model.tabs, ...model.moreGroups.flatMap((g) => g.links)].filter(
      (l) => l.planLocked,
    );
    expect(locked.length).toBeGreaterThan(0);
    for (const link of locked) {
      expect(link.upgradePlanId).not.toBeNull();
      expect(link.upgradePlanName).not.toBeNull();
    }
    const unlocked = [...model.tabs, ...model.moreGroups.flatMap((g) => g.links)].filter(
      (l) => !l.planLocked,
    );
    expect(unlocked.every((l) => l.upgradePlanId === null)).toBe(true);
  });

  it('a tenant does not see plan-locked items', () => {
    const model = buildTopNavModel(
      input({ planId: 'essentials', role: 'resident', isUnitOwner: false }),
    );
    expect([...model.tabs, ...model.moreGroups.flatMap((g) => g.links)].some((l) => l.planLocked)).toBe(
      false,
    );
  });

  // Including when a community is in scope (e.g. the page opened on a
  // community's own host): the portfolio pages never show a community's tabs.
  it.each([
    ['/pm/dashboard/communities', null],
    ['/pm/reports', null],
    ['/pm/portfolio/templates', null],
    ['/pm/dashboard/communities', 7],
  ] as const)('PM portfolio path %s (community %s) gives no tabs', (pathname, communityId) => {
    const model = buildTopNavModel(input({ pathname, role: 'property_manager', communityId }));
    expect(model).toEqual({ tabs: [], moreGroups: [], moreHasActive: false, moreHasBadge: false });
  });

  it('lapsed admin gets dashboard only', () => {
    const model = buildTopNavModel(input({ lapsedAdmin: true }));
    expect(tabIds(model)).toEqual(['dashboard']);
    expect(model.moreGroups).toEqual([]);
  });

  it('no community gives an empty model', () => {
    const model = buildTopNavModel(input({ communityId: null, pathname: '/select-community' }));
    expect(model).toEqual({ tabs: [], moreGroups: [], moreHasActive: false, moreHasBadge: false });
  });

  it('resolves hrefs as the rail does, including the one-hop apartment dashboard', () => {
    const condo = buildTopNavModel(input());
    expect(condo.tabs.find((t) => t.id === 'documents')?.href).toBe('/communities/7/documents');
    expect(condo.tabs.find((t) => t.id === 'dashboard')?.href).toBe('/dashboard?communityId=7');
    const apartment = buildTopNavModel(input({ communityType: 'apartment', planId: 'operations_plus' }));
    expect(apartment.tabs.find((t) => t.id === 'dashboard')?.href).toBe(
      '/dashboard/apartment?communityId=7',
    );
  });

  it('attaches badges by signal; a zero count is null', () => {
    const none = buildTopNavModel(input());
    expect(none.tabs.every((t) => t.badge === null)).toBe(true);

    const model = buildTopNavModel(
      input({ badges: { pendingJoinRequests: 3, missingRecords: 2 } }),
    );
    expect(model.tabs.find((t) => t.id === 'directory')?.badge).toBe(3);
    expect(model.tabs.find((t) => t.id === 'website')?.badge).toBe(2);
    expect(model.tabs.find((t) => t.id === 'documents')?.badge).toBeNull();
  });

  it('a badge inside More sets moreHasBadge', async () => {
    // No More-tier item carries a badgeSignal today, so move Directory into More
    // on a fresh copy of nav-config (the one-line navTier edit D24 promises).
    vi.resetModules();
    vi.doMock('../../src/components/layout/nav-config', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/components/layout/nav-config')>();
      const directory = actual.NAV_ITEMS.find((n) => n.id === 'directory');
      if (!directory) throw new Error('directory missing from NAV_ITEMS');
      (directory as { navTier?: string }).navTier = 'more';
      return actual;
    });
    try {
      const { buildTopNavModel: build } = await import('../../src/components/layout/top-nav-model');
      const withBadge = build(input({ badges: { pendingJoinRequests: 3, missingRecords: 0 } }));
      expect(withBadge.tabs.map((t) => t.id)).not.toContain('directory');
      const link = withBadge.moreGroups.flatMap((g) => g.links).find((l) => l.id === 'directory');
      expect(link?.badge).toBe(3);
      expect(withBadge.moreHasBadge).toBe(true);

      const without = build(input());
      expect(without.moreHasBadge).toBe(false);
    } finally {
      vi.doUnmock('../../src/components/layout/nav-config');
      vi.resetModules();
    }
  });

  it('a badge on a tab leaves moreHasBadge false', () => {
    const model = buildTopNavModel(input({ badges: { pendingJoinRequests: 3, missingRecords: 2 } }));
    expect(model.moreHasBadge).toBe(false);
  });

  it('active child inside More sets moreHasActive', () => {
    const model = buildTopNavModel(input({ pathname: '/violations', search: '?communityId=7' }));
    const link = model.moreGroups.flatMap((g) => g.links).find((l) => l.id === 'violations-inbox');
    expect(link?.active).toBe(true);
    expect(model.moreHasActive).toBe(true);
    expect(model.tabs.some((t) => t.active)).toBe(false);

    const onTab = buildTopNavModel(input({ pathname: '/communities/7/documents' }));
    expect(onTab.tabs.find((t) => t.id === 'documents')?.active).toBe(true);
    expect(onTab.moreHasActive).toBe(false);
  });
});
