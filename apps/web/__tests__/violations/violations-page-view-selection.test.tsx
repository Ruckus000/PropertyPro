/**
 * Pins which Violations view each viewer gets. The real tab rules
 * (violationsTabs / pickTab) run; the data layer and both views are stubbed.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipMock, previewMock, unitIdsMock, listsMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  previewMock: vi.fn(),
  unitIdsMock: vi.fn(),
  listsMock: vi.fn(),
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
vi.mock('@/lib/violations/resident-lists', () => ({
  loadResidentViolationLists: listsMock,
}));
vi.mock('@/components/billing/feature-gate', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/violations/violations-page', () => ({
  ViolationsPage: (props: unknown) => (
    <div data-testid="pilot" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock('@/components/violations/ViolationsAdminInbox', () => ({
  ViolationsAdminInbox: () => <div data-testid="old-inbox" />,
}));

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
const MANAGER = { ...RESIDENT, role: 'property_manager', isAdmin: true };
const BOARD = { ...RESIDENT, designation: 'board_member' };

function propsOf(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('pilot').getAttribute('data-props')!);
}

async function run(
  membership: unknown,
  preview: boolean,
  unitIds: number[],
  extra: Record<string, string> = {},
) {
  membershipMock.mockResolvedValue(membership);
  previewMock.mockResolvedValue(preview);
  unitIdsMock.mockResolvedValue(unitIds);
  listsMock.mockResolvedValue({ onYourUnit: [{ id: 1 }], yourReports: [{ id: 2 }] });
  render(await ViolationsRoute({ searchParams: Promise.resolve({ communityId: '42', ...extra }) }));
}

describe('violations route view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    previewMock.mockReset();
    unitIdsMock.mockReset();
    listsMock.mockReset();
  });

  it('redirects a plain resident when the gate is off', async () => {
    await expect(run(RESIDENT, false, [101])).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard?reason=insufficient-permissions',
    );
  });

  it('gives a manager the old inbox when the gate is off', async () => {
    await run(MANAGER, false, []);
    expect(screen.getByTestId('old-inbox')).toBeInTheDocument();
    expect(screen.queryByTestId('pilot')).toBeNull();
  });

  it('gives a manager Review only, and loads no lists', async () => {
    await run(MANAGER, true, []);
    const props = propsOf();
    expect(props['tabs']).toEqual(['review']);
    expect(props['mine']).toBeNull();
    expect(props['canCreate']).toBe(true);
    expect(listsMock).not.toHaveBeenCalled();
    expect(unitIdsMock).not.toHaveBeenCalled();
  });

  it('gives a board resident Review and Mine, with lists loaded', async () => {
    await run(BOARD, true, [101]);
    const props = propsOf();
    expect(props['tabs']).toEqual(['review', 'mine']);
    expect(props['mine']).toEqual({
      residentUnitIds: [101],
      onYourUnit: [{ id: 1 }],
      yourReports: [{ id: 2 }],
    });
    expect(listsMock).toHaveBeenCalledTimes(1);
  });

  it('gives a plain resident Mine even when they type ?tab=review', async () => {
    await run(RESIDENT, true, [101], { tab: 'review' });
    const props = propsOf();
    expect(props['tabs']).toEqual(['mine']);
    expect(props['initialTab']).toBe('mine');
    expect(props['canCreate']).toBe(false);
  });

  it('gives a resident with no units empty Mine and runs no list query', async () => {
    await run(RESIDENT, true, []);
    expect(propsOf()['mine']).toEqual({ residentUnitIds: [], onYourUnit: [], yourReports: [] });
    expect(listsMock).not.toHaveBeenCalled();
  });

  it('passes ?unitId= through as initialUnitId', async () => {
    await run(MANAGER, true, [], { unitId: '7' });
    expect(propsOf()['initialUnitId']).toBe(7);
  });
});
