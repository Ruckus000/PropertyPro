/**
 * D1a/D1b on the two server-rendered violation pages (the case detail and the
 * Mine tab of /violations) — the reads the list and detail APIs do not cover.
 * Uses the REAL `residentVisibleViolationsWhere`, `redactViolationReporter`
 * and `hydrateReportedByRole`; only the data layer
 * and the client components are stubbed, so what is asserted is exactly what
 * crosses to the browser.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthMock,
  requireMembershipMock,
  getActorUnitIdsMock,
  getViolationForCommunityMock,
  listViolationsForCommunityMock,
  detailViewMock,
  violationsPageMock,
  roleRows,
  roleLookup,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  getViolationForCommunityMock: vi.fn(),
  listViolationsForCommunityMock: vi.fn(),
  detailViewMock: vi.fn(),
  violationsPageMock: vi.fn(),
  roleRows: [] as Array<{ userId: string; role: string }>,
  roleLookup: { fails: false },
}));

// Real table objects (the predicate is built from them) plus a fake client
// whose only read is hydrateReportedByRole's user_roles lookup.
vi.mock('@propertypro/db', async () => ({
  ...(await import('../../../../packages/db/src/schema')),
  createScopedClient: () => ({
    selectFrom: async () => {
      if (roleLookup.fails) throw new Error('user_roles lookup failed');
      return roleRows;
    },
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: vi.fn() }));
vi.mock('@/lib/units/actor-units', () => ({
  getActorUnitIds: getActorUnitIdsMock,
  requireActorUnitId: vi.fn(),
}));
vi.mock('@/lib/units/unit-labels', () => ({
  withUnitLabel: async (_s: unknown, row: { unitId: number }) => ({ ...row, unitLabel: `Unit ${row.unitId}` }),
  withUnitLabels: async (_s: unknown, rows: Array<{ unitId: number }>) =>
    rows.map((r) => ({ ...r, unitLabel: `Unit ${r.unitId}` })),
}));
vi.mock('@/lib/services/violations-service', () => ({
  getViolationForCommunity: getViolationForCommunityMock,
  listViolationsForCommunity: listViolationsForCommunityMock,
}));
vi.mock('@/components/billing/feature-gate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/violations/ViolationDetailView', () => ({
  ViolationDetailView: (props: unknown) => {
    detailViewMock(props);
    return null;
  },
}));
vi.mock('@/components/violations/violations-page', () => ({
  ViolationsPage: (props: unknown) => {
    violationsPageMock(props);
    return null;
  },
}));

import ViolationDetailPage from '@/app/(authenticated)/violations/[id]/page';
import ViolationsRoute from '@/app/(authenticated)/violations/page';

const RESIDENT = {
  role: 'resident',
  isAdmin: false,
  designation: null,
  isUnitOwner: true,
  communityType: 'condo_718',
  timezone: 'America/New_York',
  violationFinesEnabled: false,
};
const BOARD_SEAT = { ...RESIDENT, designation: 'board_member' };

function row(overrides: Record<string, unknown>) {
  return {
    id: 1,
    communityId: 42,
    unitId: 101,
    reportedByUserId: 'neighbour-1',
    category: 'noise',
    description: 'Loud',
    status: 'noticed',
    severity: 'minor',
    evidenceDocumentIds: [],
    noticeDate: null,
    hearingDate: new Date('2026-12-01T15:00:00Z'),
    hearingLocation: 'Clubhouse',
    resolutionNotes: 'Private to the household',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  roleRows.length = 0;
  roleLookup.fails = false;
  roleRows.push({ userId: 'neighbour-1', role: 'resident' });
  requireAuthMock.mockResolvedValue('household-1');
  requireMembershipMock.mockResolvedValue(RESIDENT);
  getActorUnitIdsMock.mockResolvedValue([101]);
});

describe('violation detail page', () => {
  async function renderDetail() {
    render(
      await ViolationDetailPage({
        params: Promise.resolve({ id: '1' }),
        searchParams: Promise.resolve({ communityId: '42' }),
      }),
    );
    return detailViewMock.mock.calls[0]![0] as {
      violation: Record<string, unknown>;
      canManage: boolean;
      reportedByRole: string | null;
    };
  }

  it('reads a resident through the D1a predicate and strips the reporter (D1b)', async () => {
    getViolationForCommunityMock.mockResolvedValue(row({}));

    const { violation, canManage, reportedByRole } = await renderDetail();

    const [, , unitIds, visibleWhere] = getViolationForCommunityMock.mock.calls[0]!;
    expect(unitIds).toEqual([101]);
    expect(visibleWhere).toBeDefined();
    expect(violation.reportedByUserId).toBeNull();
    // No panel for a resident, so the reporter's standing is not sent either.
    expect(canManage).toBe(false);
    expect(reportedByRole).toBeNull();
  });

  it("does not send the reporter's standing to a resident who filed the report themselves", async () => {
    // The filer keeps their own id (D1b), but the standing is for the staff panel only.
    requireAuthMock.mockResolvedValue('neighbour-1');
    getViolationForCommunityMock.mockResolvedValue(row({}));

    const { violation, reportedByRole } = await renderDetail();

    expect(violation.reportedByUserId).toBe('neighbour-1');
    expect(reportedByRole).toBeNull();
  });

  it('shows a board seat every case, with the reporter', async () => {
    requireMembershipMock.mockResolvedValue(BOARD_SEAT);
    getViolationForCommunityMock.mockResolvedValue(row({}));

    const { violation, canManage, reportedByRole } = await renderDetail();

    const [, , unitIds, visibleWhere] = getViolationForCommunityMock.mock.calls[0]!;
    expect(unitIds).toBeUndefined();
    expect(visibleWhere).toBeUndefined();
    expect(violation.reportedByUserId).toBe('neighbour-1');
    expect(canManage).toBe(true);
    // For the staff Details panel: the reporter's standing in this community.
    expect(reportedByRole).toBe('resident');
  });
});

describe('violation detail page, reporter lookup failure', () => {
  it("still shows a manager the case when the reporter's standing cannot be looked up", async () => {
    requireMembershipMock.mockResolvedValue(BOARD_SEAT);
    getViolationForCommunityMock.mockResolvedValue(row({}));
    roleLookup.fails = true;

    render(
      await ViolationDetailPage({
        params: Promise.resolve({ id: '1' }),
        searchParams: Promise.resolve({ communityId: '42' }),
      }),
    );

    const props = detailViewMock.mock.calls[0]![0] as {
      violation: Record<string, unknown>;
      reportedByRole: string | null;
    };
    expect(props.violation.id).toBe(1);
    expect(props.reportedByRole).toBeNull();
  });
});

describe('violations page, Mine tab', () => {
  type Card = Record<string, unknown>;
  async function renderMine() {
    render(await ViolationsRoute({ searchParams: Promise.resolve({ communityId: '42' }) }));
    const props = violationsPageMock.mock.calls[0]![0] as {
      mine: { residentUnitIds: number[]; onYourUnit: Card[]; yourReports: Card[] };
    };
    return props.mine;
  }

  it('lists "On your unit" through the D1a predicate and "Your reports" by filer', async () => {
    listViolationsForCommunityMock.mockResolvedValue([]);

    const mine = await renderMine();

    expect(listViolationsForCommunityMock).toHaveBeenCalledTimes(2);
    const [onUnit, byFiler] = listViolationsForCommunityMock.mock.calls.map((c) => c[1]);
    expect(onUnit).toMatchObject({ allowedUnitIds: [101] });
    expect(onUnit.visibleWhere).toBeDefined();
    expect(byFiler).toEqual({ reportedByUserId: 'household-1' });
    expect(mine.residentUnitIds).toEqual([101]);
  });

  it('never names a neighbour who filed against the household, and sends only card fields', async () => {
    listViolationsForCommunityMock.mockImplementation(async (_c: number, f: Record<string, unknown>) =>
      f['reportedByUserId'] ? [] : [row({})],
    );

    const { onYourUnit } = await renderMine();

    const [card] = onYourUnit;
    expect(card!.reportedByRole).toBeNull();
    expect(card).not.toHaveProperty('reportedByUserId');
    expect(card).not.toHaveProperty('resolutionNotes');
    expect(card).not.toHaveProperty('hearingLocation');
  });

  it('sends a neighbour\'s case in "Your reports" as card fields only, with the filer\'s own attribution', async () => {
    requireAuthMock.mockResolvedValue('neighbour-1');
    listViolationsForCommunityMock.mockImplementation(async (_c: number, f: Record<string, unknown>) =>
      f['reportedByUserId'] ? [row({ id: 7, unitId: 205 }), row({ id: 8, unitId: 101 })] : [],
    );

    const { yourReports, residentUnitIds } = await renderMine();

    expect(yourReports.map((c) => c.id)).toEqual([7, 8]);
    // Linkability is decided client-side from residentUnitIds
    // (violations-page.test: "does not link a report about a unit that is not the viewer's").
    expect(residentUnitIds).toEqual([101]);
    expect(yourReports[0]).not.toHaveProperty('resolutionNotes');
    expect(yourReports[0]).not.toHaveProperty('hearingLocation');
    // The filer sees their own attribution.
    expect(yourReports[0]!.reportedByRole).toBe('resident');
  });
});
