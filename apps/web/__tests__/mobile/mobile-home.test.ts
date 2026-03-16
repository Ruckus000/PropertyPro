/**
 * Mobile home page: auth redirect + preview mode tests (server component behavior).
 *
 * We test the redirect logic by mocking auth helpers and asserting
 * that redirect() is called with the correct path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  loadDashboardDataMock,
  redirectMock,
  getPublishedTemplateMock,
  getBrandingForCommunityMock,
  getCommunityPublicInfoMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  loadDashboardDataMock: vi.fn(),
  redirectMock: vi.fn(),
  getPublishedTemplateMock: vi.fn(),
  getBrandingForCommunityMock: vi.fn(),
  getCommunityPublicInfoMock: vi.fn(),
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
vi.mock('@/lib/api/site-template', () => ({
  getPublishedTemplate: getPublishedTemplateMock,
}));
vi.mock('@/lib/api/branding', () => ({
  getBrandingForCommunity: getBrandingForCommunityMock,
  getCommunityPublicInfo: getCommunityPublicInfoMock,
}));
vi.mock('@propertypro/theme', () => ({
  resolveTheme: () => ({
    primaryColor: '#000',
    secondaryColor: '#111',
    accentColor: '#222',
    fontHeading: 'Inter',
    fontBody: 'Inter',
  }),
  toCssVars: () => ({}),
  toFontLinks: () => [],
}));

import MobileHomePage from '../../src/app/mobile/page';

const SEARCH_PARAMS_1 = Promise.resolve({ communityId: '1' });
const SEARCH_PARAMS_PREVIEW = Promise.resolve({ communityId: '1', preview: 'true' });

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
    getPublishedTemplateMock.mockResolvedValue(null);
    getBrandingForCommunityMock.mockResolvedValue(null);
    getCommunityPublicInfoMock.mockResolvedValue({
      id: 1, name: 'Test Community', slug: 'test', communityType: 'condo_718', sitePublishedAt: null,
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

  describe('preview mode', () => {
    it('skips auth and shows placeholder when no template published', async () => {
      getPublishedTemplateMock.mockResolvedValue(null);
      await MobileHomePage({ searchParams: SEARCH_PARAMS_PREVIEW });

      expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('skips auth and renders template when published', async () => {
      getPublishedTemplateMock.mockResolvedValue('<div>Hello</div>');
      await MobileHomePage({ searchParams: SEARCH_PARAMS_PREVIEW });

      expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
      expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(getPublishedTemplateMock).toHaveBeenCalledWith(1, 'mobile');
    });

    it('returns community-not-found for invalid communityId in preview', async () => {
      const params = Promise.resolve({ communityId: 'invalid', preview: 'true' });
      await MobileHomePage({ searchParams: params });

      expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    });
  });
});
