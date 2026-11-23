/**
 * Pins which report form each viewer gets. The real report-mode and role
 * predicates run; the data layer and the page component are stubbed.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipMock, unitIdsMock, listMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
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
vi.mock('@/lib/units/actor-units', () => ({
  getActorUnitIds: unitIdsMock,
  requireActorUnitId: vi.fn(),
}));
vi.mock('@/lib/services/violations-service', () => ({
  listViolationsForCommunity: listMock,
}));
vi.mock('@/components/billing/feature-gate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/violations/report-violation-page', () => ({
  ReportViolationPage: (props: unknown) => (
    <div data-testid="report-page" data-props={JSON.stringify(props)} />
  ),
}));

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
  return JSON.parse(screen.getByTestId('report-page').getAttribute('data-props')!);
}

async function run(membership: unknown, unitIds: number[]) {
  membershipMock.mockResolvedValue(membership);
  unitIdsMock.mockResolvedValue(unitIds);
  listMock.mockResolvedValue([]);
  render(await ViolationReportPage({ searchParams: Promise.resolve({ communityId: '42' }) }));
}

describe('ViolationReportPage view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    unitIdsMock.mockReset();
    listMock.mockReset();
  });

  it('gives a resident with units the resident mode, and loads no lists', async () => {
    await run(RESIDENT, [101, 102]);
    expect(propsOf()).toEqual({ communityId: 42, mode: 'resident', ownUnitIds: [101, 102] });
    expect(listMock).not.toHaveBeenCalled();
  });

  it('gives a manager the staff mode without reading their units', async () => {
    await run(MANAGER, []);
    expect(propsOf()['mode']).toBe('staff');
    expect(unitIdsMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
  });

  it('gives a resident with no unit the no-unit mode', async () => {
    await run(RESIDENT, []);
    expect(propsOf()['mode']).toBe('resident_no_unit');
  });

  it('refuses a community type without violations', async () => {
    await expect(run({ ...RESIDENT, communityType: 'apartment' }, [101])).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard?reason=feature-unavailable',
    );
  });
});
