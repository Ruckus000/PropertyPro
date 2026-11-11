/**
 * The Communities page summary (apps/web/src/lib/pm/portfolio-summary.ts).
 *
 * Status must be measured, never assumed: an apartment is "not tracked", a
 * plan without finance reports no dues, and a small association (no posting
 * clock) can never be past a deadline. The compliance numbers come from the
 * Compliance page's own rule (withDerivedStatus), so a draft or deleted
 * document never counts as posted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPortfolioDashboardMock, findPortfolioStatusInputsMock } = vi.hoisted(() => ({
  getPortfolioDashboardMock: vi.fn(),
  findPortfolioStatusInputsMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  getPortfolioDashboard: getPortfolioDashboardMock,
  findPortfolioStatusInputsUnscoped: findPortfolioStatusInputsMock,
}));

import {
  buildPortfolioSummary,
  classifyStatus,
  deriveCompliance,
  enrichRows,
  sortRows,
  type PortfolioCommunitySummary,
} from '../../src/lib/pm/portfolio-summary';
// AUTHZ: test — type-only import of the row shapes; no query runs (the module is mocked above)
import type {
  DashboardCommunityRow,
  PortfolioChecklistRow,
  PortfolioStatusInputs,
} from '@propertypro/db/unsafe';

const PAST = new Date('2020-01-01T00:00:00Z');
const FUTURE = new Date('2999-01-01T00:00:00Z');

function row(over: Partial<DashboardCommunityRow> & { communityId: number }): DashboardCommunityRow {
  return {
    communityName: `Community ${over.communityId}`,
    slug: `community-${over.communityId}`,
    communityType: 'condo_718',
    timezone: 'America/New_York',
    residentCount: 0,
    totalUnits: 50,
    openMaintenanceRequests: 0,
    unsatisfiedComplianceItems: 0,
    occupiedUnits: 0,
    occupancyRate: null,
    siteOnboardingCompletedAt: null,
    sitePublishedAt: null,
    hasUnpublishedSiteDrafts: false,
    outstandingBalanceCents: 0,
    ...over,
  };
}

function item(communityId: number, over: Partial<PortfolioChecklistRow> = {}): PortfolioChecklistRow {
  return {
    communityId,
    isApplicable: true,
    documentId: null,
    documentPostedAt: null,
    deadline: FUTURE,
    rollingWindow: null,
    ...over,
  };
}

function inputs(over: Partial<PortfolioStatusInputs> = {}): PortfolioStatusInputs {
  return { facts: new Map(), checklistRows: [], documentStates: new Map(), ...over };
}

describe('classifyStatus', () => {
  it('never tracks an apartment, even with numbers', () => {
    expect(
      classifyStatus({ communityType: 'apartment', complianceScore: 50, pastDeadlineCount: 3, overdueDuesCents: 100 }),
    ).toBe('not_tracked');
  });

  it('needs attention when a document is past its deadline', () => {
    expect(
      classifyStatus({ communityType: 'condo_718', complianceScore: 90, pastDeadlineCount: 1, overdueDuesCents: 0 }),
    ).toBe('needs_attention');
  });

  it('needs attention when dues are overdue', () => {
    expect(
      classifyStatus({ communityType: 'hoa_720', complianceScore: 100, pastDeadlineCount: 0, overdueDuesCents: 1 }),
    ).toBe('needs_attention');
  });

  it('is on track when something is measured and nothing is wrong', () => {
    expect(
      classifyStatus({ communityType: 'hoa_720', complianceScore: 78, pastDeadlineCount: 0, overdueDuesCents: null }),
    ).toBe('on_track');
  });

  it('is not tracked when nothing is measured', () => {
    expect(
      classifyStatus({ communityType: 'condo_718', complianceScore: null, pastDeadlineCount: 0, overdueDuesCents: null }),
    ).toBe('not_tracked');
  });
});

describe('deriveCompliance', () => {
  const asRecords = (rows: PortfolioChecklistRow[]) => rows as unknown as Array<Record<string, unknown>>;

  it('counts only posted documents as satisfied: drafts and deleted files do not count', () => {
    const states = new Map([
      [1, { deletedAt: null, isDraft: false }],
      [2, { deletedAt: null, isDraft: true }],
      [3, { deletedAt: PAST, isDraft: false }],
    ]);
    const result = deriveCompliance(
      asRecords([
        item(10, { documentId: 1, documentPostedAt: PAST }),
        item(10, { documentId: 2, documentPostedAt: PAST }),
        item(10, { documentId: 3, documentPostedAt: PAST }),
        item(10, { isApplicable: false }),
      ]),
      states,
      true,
    );
    expect(result).toEqual({ score: 33, pastDeadline: 0, satisfied: 1, applicable: 3 });
  });

  it('counts an unposted item past its deadline', () => {
    const result = deriveCompliance(asRecords([item(10, { deadline: PAST }), item(10)]), new Map(), true);
    expect(result.pastDeadline).toBe(1);
  });

  it('never counts anything past deadline when no posting clock runs', () => {
    const result = deriveCompliance(asRecords([item(10, { deadline: PAST })]), new Map(), false);
    expect(result.pastDeadline).toBe(0);
  });

  it('has no score when nothing applies', () => {
    expect(deriveCompliance(asRecords([item(10, { isApplicable: false })]), new Map(), true).score).toBeNull();
  });
});

describe('enrichRows', () => {
  it('reports dues only where the plan includes finance', () => {
    const rows = [
      row({ communityId: 1, communityType: 'hoa_720', outstandingBalanceCents: 500 }),
      row({ communityId: 2, communityType: 'condo_718', outstandingBalanceCents: 500 }),
    ];
    const [essentials, professional] = enrichRows(
      rows,
      inputs({
        facts: new Map([
          [1, { subscriptionPlan: 'essentials', unitCount: 120, branding: null }],
          [2, { subscriptionPlan: 'professional', unitCount: 60, branding: null }],
        ]),
      }),
    );
    expect(essentials!.overdueDuesCents).toBeNull();
    expect(professional!.overdueDuesCents).toBe(500);
    expect(professional!.status).toBe('needs_attention');
  });

  it('leaves an apartment unmeasured', () => {
    const [apt] = enrichRows(
      [row({ communityId: 3, communityType: 'apartment', outstandingBalanceCents: 900 })],
      inputs({ facts: new Map([[3, { subscriptionPlan: 'operations_plus', unitCount: 200, branding: null }]]) }),
    );
    expect(apt).toMatchObject({
      complianceScore: null,
      pastDeadlineCount: null,
      overdueDuesCents: null,
      status: 'not_tracked',
    });
  });

  it('uses the website size threshold: a 10-unit condo is never past a deadline', () => {
    const [small] = enrichRows(
      [row({ communityId: 4 })],
      inputs({
        facts: new Map([[4, { subscriptionPlan: 'essentials', unitCount: 10, branding: null }]]),
        checklistRows: [item(4, { deadline: PAST })],
      }),
    );
    expect(small!.pastDeadlineCount).toBe(0);
    expect(small!.status).toBe('on_track');
  });

  it('takes the thumbnail colour from the live look, and only a valid hex', () => {
    const [ok, bad] = enrichRows(
      [row({ communityId: 5 }), row({ communityId: 6 })],
      inputs({
        facts: new Map([
          [5, { subscriptionPlan: null, unitCount: 30, branding: { primaryColor: '#1C5A52' } }],
          [6, { subscriptionPlan: null, unitCount: 30, branding: { primaryColor: 'red; background:url(x)' } }],
        ]),
      }),
    );
    expect(ok!.brandColor).toBe('#1C5A52');
    expect(bad!.brandColor).toBeNull();
  });
});

describe('sortRows', () => {
  const summary = (id: number, name: string, over: Partial<PortfolioCommunitySummary>) =>
    ({ ...row({ communityId: id, communityName: name }), complianceScore: null, pastDeadlineCount: 0, overdueDuesCents: null, status: 'on_track', brandColor: null, ...over }) as PortfolioCommunitySummary;

  it('orders by status: needs attention, on track, not tracked', () => {
    const sorted = sortRows(
      [
        summary(1, 'A', { status: 'not_tracked' }),
        summary(2, 'B', { status: 'on_track' }),
        summary(3, 'C', { status: 'needs_attention' }),
      ],
      'status',
    );
    expect(sorted.map((r) => r.status)).toEqual(['needs_attention', 'on_track', 'not_tracked']);
  });

  it('keeps unmeasured values last in both directions', () => {
    const rows = () => [
      summary(1, 'A', { complianceScore: null }),
      summary(2, 'B', { complianceScore: 50 }),
      summary(3, 'C', { complianceScore: 90 }),
    ];
    expect(sortRows(rows(), 'complianceScore', 'asc').map((r) => r.communityId)).toEqual([2, 3, 1]);
    expect(sortRows(rows(), 'complianceScore', 'desc').map((r) => r.communityId)).toEqual([3, 2, 1]);
  });
});

describe('buildPortfolioSummary', () => {
  const KPIS = {
    totalUnits: 0,
    occupancyRate: null,
    occupancyDelta: null,
    openMaintenance: 0,
    maintenanceDelta: null,
    complianceScore: 12, // the old "any linked document" figure; must be replaced
    complianceDelta: null,
    delinquencyTotal: 999,
    delinquencyDelta: null,
    expiringLeases: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const all = [
      row({ communityId: 1, communityName: 'Sunset Condos', outstandingBalanceCents: 0 }),
      row({ communityId: 2, communityName: 'Coral Ridge', outstandingBalanceCents: 4250 }),
      row({ communityId: 3, communityName: 'Harbor Point', communityType: 'apartment' }),
    ];
    getPortfolioDashboardMock.mockImplementation(async (_user: string, filters: { search?: string }) => ({
      kpis: KPIS,
      communities: filters.search ? all.filter((r) => r.communityName.includes(filters.search!)) : all,
      totalCount: all.length,
    }));
    findPortfolioStatusInputsMock.mockResolvedValue(
      inputs({
        facts: new Map([
          [1, { subscriptionPlan: 'professional', unitCount: 72, branding: null }],
          [2, { subscriptionPlan: 'professional', unitCount: 88, branding: null }],
          [3, { subscriptionPlan: 'operations_plus', unitCount: 180, branding: null }],
        ]),
        checklistRows: [item(1, { deadline: PAST }), item(1), item(2, { documentId: 7, documentPostedAt: PAST })],
        documentStates: new Map([[7, { deletedAt: null, isDraft: false }]]),
      }),
    );
  });

  it('reads every row unpaginated and only condo/HOA checklists', async () => {
    await buildPortfolioSummary('pm-1');
    expect(getPortfolioDashboardMock).toHaveBeenCalledWith('pm-1', { unpaginated: true });
    expect(findPortfolioStatusInputsMock).toHaveBeenCalledWith([1, 2, 3], [1, 2]);
  });

  it('keeps the portfolio count and view counts unfiltered while a search narrows the rows', async () => {
    const result = await buildPortfolioSummary('pm-1', { search: 'Sunset' });
    expect(result.portfolioCount).toBe(3);
    expect(result.viewCounts).toEqual({ all: 3, needsAttention: 2, overdueDues: 1 });
    expect(result.totalCount).toBe(1);
    expect(result.communities.map((r) => r.communityName)).toEqual(['Sunset Condos']);
  });

  it('filters by saved view', async () => {
    const attention = await buildPortfolioSummary('pm-1', { view: 'needs_attention' });
    expect(attention.communities.map((r) => r.communityId).sort()).toEqual([1, 2]);
    const dues = await buildPortfolioSummary('pm-1', { view: 'overdue_dues' });
    expect(dues.communities.map((r) => r.communityId)).toEqual([2]);
  });

  it('pages after sorting', async () => {
    const result = await buildPortfolioSummary('pm-1', { sortBy: 'communityName', limit: 1, offset: 1 });
    expect(result.totalCount).toBe(3);
    expect(result.communities.map((r) => r.communityName)).toEqual(['Harbor Point']);
  });

  it('replaces only the compliance KPI; delinquency keeps its current meaning', async () => {
    const result = await buildPortfolioSummary('pm-1');
    // Condo 1: 0 of 2 posted; condo 2: 1 of 1 posted → 1 of 3.
    expect(result.kpis.complianceScore).toBe(33);
    expect(result.kpis.delinquencyTotal).toBe(999);
  });

  it('keeps the KPIs following the type/search filter', async () => {
    getPortfolioDashboardMock.mockImplementation(async (_user: string, filters: { communityType?: string }) => ({
      kpis: { ...KPIS, totalUnits: filters.communityType ? 7 : 70 },
      communities: [
        row({ communityId: 1, communityName: 'Sunset Condos' }),
        row({ communityId: 2, communityName: 'Coral Ridge' }),
        row({ communityId: 3, communityName: 'Harbor Point', communityType: 'apartment' }),
      ].filter((r) => !filters.communityType || r.communityType === filters.communityType),
      totalCount: 0,
    }));
    const result = await buildPortfolioSummary('pm-1', { communityType: 'apartment' });
    expect(getPortfolioDashboardMock).toHaveBeenCalledWith('pm-1', {
      communityType: 'apartment',
      search: undefined,
      unpaginated: true,
    });
    expect(result.kpis.totalUnits).toBe(7);
    // No condo/HOA left after the filter, so nothing to score.
    expect(result.kpis.complianceScore).toBeNull();
    expect(result.communities.map((r) => r.communityId)).toEqual([3]);
    expect(result.portfolioCount).toBe(3);
  });

  it('matches search on the slug as well as the name', async () => {
    const result = await buildPortfolioSummary('pm-1', { search: 'community-2' });
    expect(result.communities.map((r) => r.communityId)).toEqual([2]);
  });
});
