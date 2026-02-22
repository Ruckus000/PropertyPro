import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const { requireCommunityMembershipMock, getFeaturesForCommunityMock } = vi.hoisted(() => ({
  requireCommunityMembershipMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

import { resolvePmDashboardTarget } from '../../src/lib/api/community-context';

const PM_USER_ID = 'pm-user-1';
const CONDO_COMMUNITY_ID = 101;
const APARTMENT_COMMUNITY_ID = 202;

describe('resolvePmDashboardTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('input validation', () => {
    it('returns null for non-integer communityId', async () => {
      const result = await resolvePmDashboardTarget(PM_USER_ID, 1.5);
      expect(result).toBeNull();
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    it('returns null for zero communityId', async () => {
      const result = await resolvePmDashboardTarget(PM_USER_ID, 0);
      expect(result).toBeNull();
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });

    it('returns null for negative communityId', async () => {
      const result = await resolvePmDashboardTarget(PM_USER_ID, -5);
      expect(result).toBeNull();
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    });
  });

  describe('non-PM users', () => {
    it('returns null when user has owner role in community', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({
        userId: PM_USER_ID,
        communityId: CONDO_COMMUNITY_ID,
        role: 'owner',
        communityType: 'condo_718',
      });
      getFeaturesForCommunityMock.mockReturnValue({ hasLeaseTracking: false });

      const result = await resolvePmDashboardTarget(PM_USER_ID, CONDO_COMMUNITY_ID);
      expect(result).toBeNull();
    });

    it('returns null when user has board_member role', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({
        userId: PM_USER_ID,
        communityId: CONDO_COMMUNITY_ID,
        role: 'board_member',
        communityType: 'condo_718',
      });

      const result = await resolvePmDashboardTarget(PM_USER_ID, CONDO_COMMUNITY_ID);
      expect(result).toBeNull();
    });
  });

  describe('missing or revoked membership', () => {
    it('returns null when requireCommunityMembership throws ForbiddenError', async () => {
      requireCommunityMembershipMock.mockRejectedValueOnce(
        new ForbiddenError('You are not a member of this community'),
      );

      const result = await resolvePmDashboardTarget(PM_USER_ID, CONDO_COMMUNITY_ID);
      expect(result).toBeNull();
    });

    it('returns null when requireCommunityMembership throws an unexpected error', async () => {
      requireCommunityMembershipMock.mockRejectedValueOnce(new Error('DB connection error'));

      const result = await resolvePmDashboardTarget(PM_USER_ID, CONDO_COMMUNITY_ID);
      expect(result).toBeNull();
    });
  });

  describe('valid PM access — routing by features', () => {
    it('routes condo community (no lease tracking) to /dashboard', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({
        userId: PM_USER_ID,
        communityId: CONDO_COMMUNITY_ID,
        role: 'property_manager_admin',
        communityType: 'condo_718',
      });
      getFeaturesForCommunityMock.mockReturnValueOnce({ hasLeaseTracking: false });

      const result = await resolvePmDashboardTarget(PM_USER_ID, CONDO_COMMUNITY_ID);
      expect(result).toBe(`/dashboard?communityId=${CONDO_COMMUNITY_ID}`);
    });

    it('routes HOA community (no lease tracking) to /dashboard', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({
        userId: PM_USER_ID,
        communityId: CONDO_COMMUNITY_ID,
        role: 'property_manager_admin',
        communityType: 'hoa_720',
      });
      getFeaturesForCommunityMock.mockReturnValueOnce({ hasLeaseTracking: false });

      const result = await resolvePmDashboardTarget(PM_USER_ID, CONDO_COMMUNITY_ID);
      expect(result).toBe(`/dashboard?communityId=${CONDO_COMMUNITY_ID}`);
    });

    it('routes apartment community (has lease tracking) to /dashboard/apartment', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({
        userId: PM_USER_ID,
        communityId: APARTMENT_COMMUNITY_ID,
        role: 'property_manager_admin',
        communityType: 'apartment',
      });
      getFeaturesForCommunityMock.mockReturnValueOnce({ hasLeaseTracking: true });

      const result = await resolvePmDashboardTarget(PM_USER_ID, APARTMENT_COMMUNITY_ID);
      expect(result).toBe(`/dashboard/apartment?communityId=${APARTMENT_COMMUNITY_ID}`);
    });
  });

  describe('authorization boundary — no data leakage', () => {
    it('does not call getFeaturesForCommunity when membership is denied', async () => {
      requireCommunityMembershipMock.mockRejectedValueOnce(
        new ForbiddenError('Not a member'),
      );

      await resolvePmDashboardTarget(PM_USER_ID, CONDO_COMMUNITY_ID);
      expect(getFeaturesForCommunityMock).not.toHaveBeenCalled();
    });

    it('does not call getFeaturesForCommunity when user is non-PM', async () => {
      requireCommunityMembershipMock.mockResolvedValueOnce({
        userId: PM_USER_ID,
        communityId: CONDO_COMMUNITY_ID,
        role: 'cam',
        communityType: 'condo_718',
      });

      await resolvePmDashboardTarget(PM_USER_ID, CONDO_COMMUNITY_ID);
      expect(getFeaturesForCommunityMock).not.toHaveBeenCalled();
    });
  });
});
