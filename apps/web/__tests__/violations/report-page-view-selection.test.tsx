/**
 * Pins which Report-a-violation view each viewer gets. The real report-mode
 * and role predicates run; the data layer and both views are stubbed.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipMock, previewMock, unitIdsMock, listMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  previewMock: vi.fn(),
  unitIdsMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('@propertypro/db', async () => ({
  ...(await import('../../../../packages/db/src/schema')),
  createScopedClient: () => ({ selectFrom: async () => [] }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'user-1'),
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: membershipMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: vi.fn() }));
vi.mock('@/lib/design-preview', () => ({ isDesignPreviewOn: previewMock }));
vi.mock('@/lib/units/actor-units', () => ({
  getActorUnitIds: unitIdsMock,
  requireActorUnitId: vi.fn(),
}));
vi.mock('@/lib/units/unit-labels', () => ({
  withUnitLabels: async (_s: unknown, rows: unknown[]) => rows,
}));
vi.mock('@/lib/services/violations-service', () => ({
  listViolationsForCommunity: listMock,
}));
vi.mock('@/components/billing/feature-gate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/violations/report-violation-page', () => ({
  ReportViolationPage: (props: unknown) => (
    <div data-testid="report-pilot" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock('@/components/violations/ViolationReportForm', () => ({
  ViolationReportForm: () => <div data-testid="old-form" />,
}));
vi.mock('@/components/violations/StaffViolationReportForm', () => ({
  StaffViolationReportForm: () => <div data-testid="old-staff-form" />,
}));
vi.mock('@/components/violations/ViolationCard', () => ({ ViolationCard: () => null }));

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
const MANAGER = { ...RESIDENT, role: 'property_manager', isAdmin: true };

function propsOf(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('report-pilot').getAttribute('data-props')!);
}

async function run(membership: unknown, preview: boolean, unitIds: number[]) {
  membershipMock.mockResolvedValue(membership);
  previewMock.mockResolvedValue(preview);
  unitIdsMock.mockResolvedValue(unitIds);
  listMock.mockResolvedValue([]);
  render(await ViolationReportPage({ searchParams: Promise.resolve({ communityId: '42' }) }));
}

describe('ViolationReportPage view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    previewMock.mockReset();
    unitIdsMock.mockReset();
    listMock.mockReset();
  });

  it('gives a resident with units the resident mode, and loads no lists', async () => {
    await run(RESIDENT, true, [101, 102]);
    expect(propsOf()).toEqual({ communityId: 42, mode: 'resident', ownUnitIds: [101, 102] });
    expect(listMock).not.toHaveBeenCalled();
  });

  it('gives a manager the staff mode, and loads no lists', async () => {
    await run(MANAGER, true, []);
    expect(propsOf()['mode']).toBe('staff');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('gives a resident with no unit the no-unit mode, and loads no lists', async () => {
    await run(RESIDENT, true, []);
    expect(propsOf()['mode']).toBe('resident_no_unit');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('renders the old form and loads the lists when the gate is off', async () => {
    await run(RESIDENT, false, [101]);
    expect(screen.getByTestId('old-form')).toBeInTheDocument();
    expect(screen.queryByTestId('report-pilot')).toBeNull();
    expect(listMock).toHaveBeenCalledTimes(2);
  });
});
