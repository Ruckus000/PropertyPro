/**
 * The violations inbox admits whoever the violation admin writes admit
 * (requireViolationAdminWrite → canActAsBoard): managers and board seats.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipMock, redirectMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'u1'),
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: membershipMock,
}));
vi.mock('@/components/violations/ViolationsAdminInbox', () => ({ ViolationsAdminInbox: () => null }));
vi.mock('@/components/billing/feature-gate', () => ({ FeatureGate: () => null }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import ViolationsPage from '../../../src/app/(authenticated)/violations/page';

const base = { communityType: 'condo_718', violationFinesEnabled: false };
const open = () => ViolationsPage({ searchParams: Promise.resolve({ communityId: '1' }) });

describe('violations inbox access', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('admits a resident with a board seat', async () => {
    membershipMock.mockResolvedValue({ ...base, role: 'resident', isAdmin: false, designation: 'board_member' });
    await expect(open()).resolves.toBeTruthy();
  });

  it('admits a manager', async () => {
    membershipMock.mockResolvedValue({ ...base, role: 'property_manager', isAdmin: true, designation: null });
    await expect(open()).resolves.toBeTruthy();
  });

  it('turns away any other resident', async () => {
    membershipMock.mockResolvedValue({ ...base, role: 'resident', isAdmin: false, designation: null });
    await expect(open()).rejects.toThrow('redirect:/dashboard?reason=insufficient-permissions');
  });
});

describe('violations inbox for one unit', () => {
  it('passes ?unitId= to the inbox as its starting filter (the Directory\'s Records link)', async () => {
    membershipMock.mockResolvedValue({ ...base, role: 'property_manager', isAdmin: true, designation: null });
    const page = (await ViolationsPage({ searchParams: Promise.resolve({ communityId: '1', unitId: '5' }) })) as {
      props: { children: { props: { initialUnitId?: number } } };
    };
    expect(page.props.children.props.initialUnitId).toBe(5);
  });
});
