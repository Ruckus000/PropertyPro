/**
 * Pins which Violations tabs each viewer gets, and who is refused. The real tab
 * rules (violationsTabs / pickTab) run; the data layer and the page component
 * are stubbed.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipMock, unitIdsMock, listsMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
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
    <div data-testid="violations-page" data-props={JSON.stringify(props)} />
  ),
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
// CommunityRole admits no such member today; it pins that the page refuses
// rather than admits whoever violationsTabs gives no tab.
const NEITHER = { ...RESIDENT, role: 'property_manager', isAdmin: false };

function propsOf(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('violations-page').getAttribute('data-props')!);
}

async function run(
  membership: unknown,
  unitIds: number[],
  extra: Record<string, string> = {},
) {
  membershipMock.mockResolvedValue(membership);
  unitIdsMock.mockResolvedValue(unitIds);
  listsMock.mockResolvedValue({ onYourUnit: [{ id: 1 }], yourReports: [{ id: 2 }] });
  render(await ViolationsRoute({ searchParams: Promise.resolve({ communityId: '42', ...extra }) }));
}

describe('violations route view selection', () => {
  beforeEach(() => {
    membershipMock.mockReset();
    unitIdsMock.mockReset();
    listsMock.mockReset();
  });

  it('admits a plain resident with Mine only', async () => {
    await run(RESIDENT, [101]);
    const props = propsOf();
    expect(props['tabs']).toEqual(['mine']);
    expect(props['initialTab']).toBe('mine');
    expect(props['mine']).toEqual({
      residentUnitIds: [101],
      onYourUnit: [{ id: 1 }],
      yourReports: [{ id: 2 }],
    });
  });

  it('refuses a member with neither tab (not a resident, no admin, no board seat)', async () => {
    await expect(run(NEITHER, [])).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard?reason=insufficient-permissions',
    );
    expect(unitIdsMock).not.toHaveBeenCalled();
    expect(listsMock).not.toHaveBeenCalled();
  });

  it('refuses a member with neither tab as insufficient-permissions, not feature-unavailable, in a type without violations', async () => {
    await expect(run({ ...NEITHER, communityType: 'apartment' }, [])).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard?reason=insufficient-permissions',
    );
  });

  it('sends a resident in a type without violations to feature-unavailable, loading nothing', async () => {
    await expect(run({ ...RESIDENT, communityType: 'apartment' }, [101])).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard?reason=feature-unavailable',
    );
    expect(listsMock).not.toHaveBeenCalled();
  });

  it('gives a manager Review only, and loads no lists', async () => {
    await run(MANAGER, []);
    const props = propsOf();
    expect(props['tabs']).toEqual(['review']);
    expect(props['mine']).toBeNull();
    expect(props['canCreate']).toBe(true);
    expect(listsMock).not.toHaveBeenCalled();
    expect(unitIdsMock).not.toHaveBeenCalled();
  });

  it('gives a board resident Review and Mine, with lists loaded', async () => {
    await run(BOARD, [101]);
    const props = propsOf();
    expect(props['tabs']).toEqual(['review', 'mine']);
    expect(props['mine']).toEqual({
      residentUnitIds: [101],
      onYourUnit: [{ id: 1 }],
      yourReports: [{ id: 2 }],
    });
    expect(listsMock).toHaveBeenCalledTimes(1);
  });

  it('gives a board resident with no units empty Mine and runs no list query', async () => {
    await run(BOARD, []);
    const props = propsOf();
    expect(props['tabs']).toEqual(['review', 'mine']);
    expect(props['mine']).toEqual({ residentUnitIds: [], onYourUnit: [], yourReports: [] });
    expect(listsMock).not.toHaveBeenCalled();
  });

  it('gives a plain resident Mine even when they type ?tab=review', async () => {
    await run(RESIDENT, [101], { tab: 'review' });
    const props = propsOf();
    expect(props['tabs']).toEqual(['mine']);
    expect(props['initialTab']).toBe('mine');
    expect(props['canCreate']).toBe(false);
  });

  it('gives a resident with no units empty Mine and runs no list query', async () => {
    await run(RESIDENT, []);
    expect(propsOf()['mine']).toEqual({ residentUnitIds: [], onYourUnit: [], yourReports: [] });
    expect(listsMock).not.toHaveBeenCalled();
  });

  it('passes ?unitId= through as initialUnitId', async () => {
    await run(MANAGER, [], { unitId: '7' });
    expect(propsOf()['initialUnitId']).toBe(7);
  });
});
