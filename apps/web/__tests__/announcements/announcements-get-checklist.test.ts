/**
 * Focused unit test — GET /api/v1/announcements auto-completes the
 * `review_announcement` onboarding checklist item (B2).
 *
 * Board members and owners/tenants carry `review_announcement`; before this it
 * had no completion trigger, so those roles could never reach 100%. The GET
 * handler now fires tryAutoComplete on list load.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  listVisibleAnnouncementsMock,
  tryAutoCompleteMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  listVisibleAnnouncementsMock: vi.fn(),
  tryAutoCompleteMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/db/access-control', () => ({
  checkPermissionV2: vi.fn(),
  requirePermission: requirePermissionMock,
}));
vi.mock('@/lib/announcements/read-visibility', () => ({
  listVisibleAnnouncements: listVisibleAnnouncementsMock,
}));
vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));
// Heavy transitive deps used only by POST — no-op so the module loads.
vi.mock('@/lib/middleware/audit-middleware', () => ({
  withAuditLog: (fn: unknown) => fn,
}));
vi.mock('@/lib/services/announcement-delivery', () => ({ queueAnnouncementDelivery: vi.fn() }));
vi.mock('@/lib/services/notification-service', () => ({ createNotificationsForEvent: vi.fn() }));
vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn(),
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn() }));
vi.mock('@/lib/utils/html-sanitizer', () => ({ sanitizeHtml: (s: string) => s }));
vi.mock('@/lib/services/announcement-service', () => ({
  createAnnouncementForCommunity: vi.fn(),
  getAnnouncementAuthorName: vi.fn(),
  getAnnouncementById: vi.fn(),
  getAnnouncementByIdIncludingDeleted: vi.fn(),
  restoreAnnouncementForCommunity: vi.fn(),
  softDeleteAnnouncementForCommunity: vi.fn(),
  updateAnnouncementForCommunity: vi.fn(),
}));

import { GET } from '../../src/app/api/v1/announcements/route';

const USER_ID = 'user-board-1';
const MEMBERSHIP = { userId: USER_ID, communityId: 55, role: 'resident', communityType: 'condo_718' };

describe('GET /api/v1/announcements — checklist auto-complete (B2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    resolveEffectiveCommunityIdMock.mockReturnValue(55);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    listVisibleAnnouncementsMock.mockResolvedValue({
      rows: [{ id: 1, title: 'Welcome' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
  });

  it('fires review_announcement on a successful list', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/announcements?communityId=55'),
    );

    expect(res.status).toBe(200);
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(55, USER_ID, 'review_announcement');
  });

  it('does not fire when communityId is missing (400 before the list)', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/v1/announcements'));

    expect(res.status).toBe(400);
    expect(tryAutoCompleteMock).not.toHaveBeenCalled();
  });
});
