/**
 * D1a/D1b on the two server-rendered violation pages — the reads the list and
 * detail APIs do not cover. Uses the REAL `residentVisibleViolationsWhere`,
 * `redactViolationReporter` and `hydrateReportedByRole`; only the data layer
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
  cardMock,
  reportFormMock,
  roleRows,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  getActorUnitIdsMock: vi.fn(),
  getViolationForCommunityMock: vi.fn(),
  listViolationsForCommunityMock: vi.fn(),
  detailViewMock: vi.fn(),
  cardMock: vi.fn(),
  reportFormMock: vi.fn(),
  roleRows: [] as Array<{ userId: string; role: string }>,
}));

// Real table objects (the predicate is built from them) plus a fake client
// whose only read is hydrateReportedByRole's user_roles lookup.
vi.mock('@propertypro/db', async () => ({
  ...(await import('../../../../packages/db/src/schema')),
  createScopedClient: () => ({ selectFrom: async () => roleRows }),
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
vi.mock('@/lib/design-preview', () => ({ isDesignPreviewOn: vi.fn(async () => false) }));
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
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/violations/ViolationDetailView', () => ({
  ViolationDetailView: (props: unknown) => {
    detailViewMock(props);
    return null;
  },
}));
vi.mock('@/components/violations/ViolationCard', () => ({
  ViolationCard: (props: unknown) => {
    cardMock(props);
    return null;
  },
}));
vi.mock('@/components/violations/ViolationReportForm', () => ({
  ViolationReportForm: (props: unknown) => {
    reportFormMock(props);
    return null;
  },
}));
vi.mock('@/components/violations/StaffViolationReportForm', () => ({
  StaffViolationReportForm: () => null,
}));

import ViolationDetailPage from '@/app/(authenticated)/violations/[id]/page';
import ViolationReportPage from '@/app/(authenticated)/violations/report/page';

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
    return detailViewMock.mock.calls[0]![0] as { violation: Record<string, unknown> };
  }

  it('reads a resident through the D1a predicate and strips the reporter (D1b)', async () => {
    getViolationForCommunityMock.mockResolvedValue(row({}));

    const { violation } = await renderDetail();

    const [, , unitIds, visibleWhere] = getViolationForCommunityMock.mock.calls[0]!;
    expect(unitIds).toEqual([101]);
    expect(visibleWhere).toBeDefined();
    expect(violation.reportedByUserId).toBeNull();
  });

  it('shows a board seat every case, with the reporter', async () => {
    requireMembershipMock.mockResolvedValue(BOARD_SEAT);
    getViolationForCommunityMock.mockResolvedValue(row({}));

    const { violation } = await renderDetail();

    const [, , unitIds, visibleWhere] = getViolationForCommunityMock.mock.calls[0]!;
    expect(unitIds).toBeUndefined();
    expect(visibleWhere).toBeUndefined();
    expect(violation.reportedByUserId).toBe('neighbour-1');
  });
});

describe('violation report page', () => {
  async function renderReport() {
    render(await ViolationReportPage({ searchParams: Promise.resolve({ communityId: '42' }) }));
    return cardMock.mock.calls.map(
      (c) => c[0] as { violation: Record<string, unknown>; linkable?: boolean },
    );
  }

  it('lists "On your unit" through the D1a predicate and "Your reports" by filer', async () => {
    listViolationsForCommunityMock.mockResolvedValue([]);

    await renderReport();

    expect(listViolationsForCommunityMock).toHaveBeenCalledTimes(2);
    const [onUnit, mine] = listViolationsForCommunityMock.mock.calls.map((c) => c[1]);
    expect(onUnit).toMatchObject({ allowedUnitIds: [101] });
    expect(onUnit.visibleWhere).toBeDefined();
    expect(mine).toEqual({ reportedByUserId: 'household-1' });
    expect(reportFormMock).toHaveBeenCalledWith(expect.objectContaining({ ownUnitIds: [101] }));
  });

  it('never names a neighbour who filed against the household, and sends only card fields', async () => {
    listViolationsForCommunityMock.mockImplementation(async (_c: number, f: Record<string, unknown>) =>
      f['reportedByUserId'] ? [] : [row({})],
    );

    const [card] = await renderReport();

    expect(card!.violation.reportedByRole).toBeNull();
    expect(card!.violation).not.toHaveProperty('reportedByUserId');
    expect(card!.violation).not.toHaveProperty('resolutionNotes');
    expect(card!.violation).not.toHaveProperty('hearingLocation');
    expect(card!.linkable).toBeUndefined();
  });

  it('links "Your reports" only where the unit is the reporter\'s own', async () => {
    requireAuthMock.mockResolvedValue('neighbour-1');
    listViolationsForCommunityMock.mockImplementation(async (_c: number, f: Record<string, unknown>) =>
      f['reportedByUserId']
        ? [row({ id: 7, unitId: 205 }), row({ id: 8, unitId: 101 })]
        : [],
    );

    const cards = await renderReport();

    expect(cards.map((c) => [c.violation.id, c.linkable])).toEqual([
      [7, false],
      [8, true],
    ]);
    // The filer sees their own attribution.
    expect(cards[0]!.violation.reportedByRole).toBe('resident');
  });
});
