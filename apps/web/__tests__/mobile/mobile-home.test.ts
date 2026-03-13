/**
 * Mobile home page: auth redirect tests (server component behavior).
 *
 * We test the redirect logic by mocking auth helpers and asserting
 * that redirect() is called with the correct path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAuthenticatedUserIdMock, requireCommunityMembershipMock, loadDashboardDataMock, redirectMock } =
  vi.hoisted(() => ({
    requireAuthenticatedUserIdMock: vi.fn(),
    requireCommunityMembershipMock: vi.fn(),
    loadDashboardDataMock: vi.fn(),
    redirectMock: vi.fn(),
  }));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/dashboard/load-dashboard-data', () => ({
  loadDashboardData: loadDashboardDataMock,
}));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));
vi.mock('@/components/mobile/CompactCard', () => ({
  CompactCard: () => null,
}));

import MobileHomePage from '../../src/app/mobile/page';

const SEARCH_PARAMS_1 = Promise.resolve({ communityId: '1' });

describe('MobileHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
      communityId: 1,
      userId: 'user-1',
      communityType: 'condo_718',
    });
    loadDashboardDataMock.mockResolvedValue({
      firstName: 'Jane',
      communityName: 'Palm Gardens',
      timezone: 'America/New_York',
      announcements: [],
      meetings: [],
    });
  });

  it('redirects to /auth/login when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new Error('Unauthorized'));
    await MobileHomePage({ searchParams: SEARCH_PARAMS_1 });
    expect(redirectMock).toHaveBeenCalledWith('/auth/login');
  });

  it('redirects to /auth/login when membership denied', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new Error('Forbidden'));
    await MobileHomePage({ searchParams: SEARCH_PARAMS_1 });
    expect(redirectMock).toHaveBeenCalledWith('/auth/login');
  });

  it('calls loadDashboardData with correct communityId and userId', async () => {
    await MobileHomePage({ searchParams: SEARCH_PARAMS_1 });
    expect(loadDashboardDataMock).toHaveBeenCalledWith(1, 'user-1');
  });
});
