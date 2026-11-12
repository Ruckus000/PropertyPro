/**
 * The Communities page's pure rules: which layout a portfolio gets, the
 * default view, how a status reads, and the dense table's totals.
 */
import { describe, expect, it } from 'vitest';
import type { PortfolioCommunity } from '../../src/hooks/use-portfolio-dashboard';
import {
  communityMeta,
  defaultViewMode,
  groupByStatus,
  pickTier,
  safeBrandColor,
  statusDetails,
  totalsOf,
  visibleInGroup,
} from '../../src/lib/pm/communities-page';

function community(o: Partial<PortfolioCommunity> = {}): PortfolioCommunity {
  return {
    communityId: 1,
    communityName: 'Sunset Towers',
    communityType: 'condo_718',
    totalUnits: 148,
    residentCount: 231,
    occupancyRate: null,
    occupiedUnits: null,
    openMaintenanceRequests: 0,
    complianceScore: 94,
    outstandingBalance: 0,
    expiringLeases: 0,
    siteOnboardingCompletedAt: null,
    sitePublishedAt: null,
    hasUnpublishedSiteDrafts: false,
    slug: 'sunset-towers',
    pastDeadlineCount: 0,
    overdueDuesCents: 0,
    status: 'on_track',
    brandColor: null,
    ...o,
  };
}

describe('pickTier', () => {
  it.each([
    [1, 'chooser'],
    [2, 'chooser'],
    [3, 'gallery'],
    [8, 'gallery'],
    [9, 'grouped'],
    [24, 'grouped'],
    [25, 'dense'],
    [480, 'dense'],
  ] as const)('%i communities → %s', (count, tier) => {
    expect(pickTier(count)).toBe(tier);
  });
});

describe('defaultViewMode', () => {
  it('shows cards up to eight communities and a list from nine', () => {
    expect(defaultViewMode('chooser')).toBe('cards');
    expect(defaultViewMode('gallery')).toBe('cards');
    expect(defaultViewMode('grouped')).toBe('list');
    expect(defaultViewMode('dense')).toBe('list');
  });
});

describe('statusDetails', () => {
  it('names the documents past deadline and the overdue dues', () => {
    const c = community({ status: 'needs_attention', pastDeadlineCount: 3, overdueDuesCents: 425000 });
    expect(statusDetails(c)).toEqual(['3 documents past deadline', 'Overdue dues']);
    expect(statusDetails(c, { duesAmount: true })).toEqual(['3 documents past deadline', 'Overdue dues $4,250']);
  });

  it('says "1 document", not "1 documents"', () => {
    expect(statusDetails(community({ status: 'needs_attention', pastDeadlineCount: 1 }))).toEqual([
      '1 document past deadline',
    ]);
  });

  it('reports what was measured when on track, and dues the plan does not carry', () => {
    expect(statusDetails(community({ complianceScore: 78, overdueDuesCents: null }))).toEqual([
      'Compliance 78%',
      'Dues not on plan',
    ]);
  });

  it('adds open requests only where no Requests column shows them', () => {
    const c = community({ openMaintenanceRequests: 3 });
    expect(statusDetails(c)).toEqual(['Compliance 94%']);
    expect(statusDetails(c, { requests: true })).toEqual(['Compliance 94%', '3 open requests']);
  });

  it('explains why an apartment is not tracked', () => {
    const apt = community({ communityType: 'apartment', status: 'not_tracked', complianceScore: null, overdueDuesCents: null });
    expect(statusDetails(apt)).toEqual(['No posting rules']);
    expect(statusDetails(apt, { long: true })).toEqual(["No posting rules for apartments, and rent isn't counted here"]);
  });

  it('says "No overdue dues" in the chooser only when dues were measured at zero', () => {
    expect(statusDetails(community(), { long: true })).toContain('No overdue dues');
    expect(statusDetails(community({ overdueDuesCents: null }), { long: true })).not.toContain('No overdue dues');
  });
});

describe('communityMeta', () => {
  it('adds residents for an association and occupancy for an apartment', () => {
    expect(communityMeta(community())).toBe('Condo · 148 units');
    expect(communityMeta(community(), { long: true })).toBe('Condo · 148 units · 231 residents');
    expect(
      communityMeta(community({ communityType: 'apartment', totalUnits: 212, occupancyRate: 96 }), { long: true }),
    ).toBe('Apartment · 212 units · 96% occupied');
  });
});

describe('groupByStatus / visibleInGroup', () => {
  it('orders groups worst first and drops empty ones', () => {
    const groups = groupByStatus([
      community({ communityId: 1, status: 'not_tracked' }),
      community({ communityId: 2, status: 'needs_attention' }),
    ]);
    expect(groups.map((g) => g.status)).toEqual(['needs_attention', 'not_tracked']);
  });

  it('never folds Needs attention, and never leaves "Show 1 more"', () => {
    expect(visibleInGroup('needs_attention', 20, false)).toBe(20);
    expect(visibleInGroup('on_track', 6, false)).toBe(6);
    expect(visibleInGroup('on_track', 9, false)).toBe(5);
    expect(visibleInGroup('on_track', 9, true)).toBe(9);
  });
});

describe('totalsOf', () => {
  it('adds up what was measured and leaves out what was not', () => {
    const totals = totalsOf([
      community({ totalUnits: 100, complianceScore: 80, pastDeadlineCount: 2, overdueDuesCents: 1000, openMaintenanceRequests: 1 }),
      community({ totalUnits: 50, complianceScore: 90, pastDeadlineCount: 0, overdueDuesCents: null, openMaintenanceRequests: 2 }),
      community({
        communityType: 'apartment',
        totalUnits: 200,
        complianceScore: null,
        pastDeadlineCount: null,
        overdueDuesCents: null,
        occupancyRate: 90,
        occupiedUnits: 180,
        openMaintenanceRequests: 4,
      }),
    ]);
    expect(totals).toEqual({
      count: 3,
      units: 350,
      complianceScore: 85,
      pastDeadline: 2,
      occupancyRate: 90,
      openRequests: 7,
      overdueDuesCents: 1000,
    });
  });

  it('shows no figure when nothing in a column was measured', () => {
    const totals = totalsOf([community({ complianceScore: null, pastDeadlineCount: null, overdueDuesCents: null })]);
    expect(totals.complianceScore).toBeNull();
    expect(totals.pastDeadline).toBeNull();
    expect(totals.overdueDuesCents).toBeNull();
    expect(totals.occupancyRate).toBeNull();
  });
});

describe('safeBrandColor', () => {
  it('passes a #RRGGBB colour and refuses anything else', () => {
    expect(safeBrandColor('#1F5C53')).toBe('#1F5C53');
    expect(safeBrandColor('red; background-image: url(x)')).toBeNull();
    expect(safeBrandColor(null)).toBeNull();
  });
});
