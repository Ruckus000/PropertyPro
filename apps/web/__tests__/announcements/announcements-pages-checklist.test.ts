/**
 * Opening the announcements page (desktop or mobile) completes the
 * `review_announcement` checklist step, as the list API does. Before this only
 * the API fired it, and the server-rendered pages never call the API, so a
 * resident who read announcements on either page could not reach 100%.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  tryAutoCompleteMock,
  requirePermissionMock,
  requireUserMock,
  requireMembershipMock,
  listVisibleAnnouncementsMock,
} = vi.hoisted(() => ({
  tryAutoCompleteMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireUserMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  listVisibleAnnouncementsMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolvePageCommunityContext: () => ({ communityId: 42 }),
}));
vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireUserMock,
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/db/access-control', () => ({
  checkPermissionV2: () => false,
  requirePermission: requirePermissionMock,
}));
vi.mock('@/lib/announcements/read-visibility', () => ({
  listVisibleAnnouncements: listVisibleAnnouncementsMock,
}));
vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));
vi.mock('@/lib/utils/timezone', () => ({ resolveTimezone: () => 'America/New_York' }));
vi.mock('@/components/announcements/announcement-list-container', () => ({
  AnnouncementListContainer: () => null,
}));
vi.mock('@/components/mobile/MobileAnnouncementsContent', () => ({
  MobileAnnouncementsContent: () => null,
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }));

import AnnouncementsPage from '@/app/(authenticated)/announcements/page';
import MobileAnnouncementsPage from '@/app/mobile/announcements/page';

const membership = {
  role: 'resident',
  communityType: 'condo_718',
  isUnitOwner: true,
  isAdmin: false,
  timezone: 'America/New_York',
};

describe('announcements pages complete review_announcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockReset();
    requireUserMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue(membership);
    listVisibleAnnouncementsMock.mockResolvedValue({ rows: [], totalCount: 0 });
  });

  it('desktop page fires it for a member who can read announcements', async () => {
    await AnnouncementsPage({ searchParams: Promise.resolve({}) });
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(42, 'user-1', 'review_announcement');
  });

  it('mobile page fires it for a member who can read announcements', async () => {
    await MobileAnnouncementsPage({
      searchParams: Promise.resolve({ communityId: '42' }),
    } as never);
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(42, 'user-1', 'review_announcement');
  });

  it('neither page fires it when the read permission is refused', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error('forbidden');
    });
    await expect(AnnouncementsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'forbidden',
    );
    await expect(
      MobileAnnouncementsPage({
        searchParams: Promise.resolve({ communityId: '42' }),
      } as never),
    ).rejects.toThrow('forbidden');
    expect(tryAutoCompleteMock).not.toHaveBeenCalled();
  });
});
