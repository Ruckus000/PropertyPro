/**
 * Who /violations admits. Review follows the violation admin writes
 * (requireViolationAdminWrite → canActAsBoard): managers and board seats. Mine
 * admits every resident. A member with neither is turned away.
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
vi.mock('@/components/billing/feature-gate', () => ({ FeatureGate: () => null }));
// The page imports the data layer at runtime; stub it so the file loads without DATABASE_URL.
vi.mock('@propertypro/db', async () => ({
  ...(await import('../../../../../packages/db/src/schema')),
  createScopedClient: () => ({ selectFrom: async () => [] }),
}));
vi.mock('@/lib/units/actor-units', () => ({ getActorUnitIds: vi.fn(async () => []), requireActorUnitId: vi.fn() }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: vi.fn() }));
vi.mock('@/lib/violations/resident-lists', () => ({ loadResidentViolationLists: vi.fn() }));
vi.mock('@/components/violations/violations-page', () => ({ ViolationsPage: () => null }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import ViolationsPage from '../../../src/app/(authenticated)/violations/page';

const base = { communityType: 'condo_718', violationFinesEnabled: false };
const open = () => ViolationsPage({ searchParams: Promise.resolve({ communityId: '1' }) });

describe('violations page access', () => {
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

  it('admits a plain resident (Mine)', async () => {
    membershipMock.mockResolvedValue({ ...base, role: 'resident', isAdmin: false, designation: null });
    await expect(open()).resolves.toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('turns away a member with neither tab', async () => {
    membershipMock.mockResolvedValue({ ...base, role: 'property_manager', isAdmin: false, designation: null });
    await expect(open()).rejects.toThrow('redirect:/dashboard?reason=insufficient-permissions');
  });
});
