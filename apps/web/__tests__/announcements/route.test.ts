import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { AppError } from '../../src/lib/api/errors/AppError';

const {
  createScopedClientMock,
  auditLogMock,
  logAuditEventMock,
  queueAnnouncementDeliveryMock,
  announcementsTableMock,
  usersTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireActiveSubscriptionForMutationMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  auditLogMock: vi.fn().mockResolvedValue(undefined),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  queueAnnouncementDeliveryMock: vi.fn().mockResolvedValue(3),
  announcementsTableMock: {
    id: Symbol('announcements.id'),
  },
  usersTableMock: Symbol('users'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue({
    userId: 'session-user-1',
    communityId: 200,
    role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
    communityType: 'condo_718',
  }),
  requireActiveSubscriptionForMutationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  announcements: announcementsTableMock,
  users: usersTableMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/audit-middleware', () => ({
  withAuditLog: (extractContext: unknown, handler: unknown) => {
    return async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const extracted = await (extractContext as (
        r: NextRequest,
        c?: { params: Promise<Record<string, string>> },
      ) => Promise<{ userId: string; communityId: number }>)(req, context);
      return (handler as (r: NextRequest, c: unknown, audit: unknown) => Promise<Response>)(
        req,
        context,
        { ...extracted, log: auditLogMock },
      );
    };
  },
}));

vi.mock('@/lib/services/announcement-delivery', () => ({
  queueAnnouncementDelivery: queueAnnouncementDeliveryMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { GET, POST } from '../../src/app/api/v1/announcements/route';

describe('p1-17 announcements route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');

    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockImplementation(async (table) => {
        if (table === usersTableMock) {
          return [{ id: 'session-user-1', fullName: 'Session User' }];
        }
        return [];
      }),
      insert: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue([]),
    });
  });

  it('GET uses scoped client with requested communityId and excludes archived by default', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 1,
        title: 'Pinned',
        body: 'Pinned body',
        audience: 'all',
        isPinned: true,
        archivedAt: null,
        publishedBy: 'f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81',
        publishedAt: '2026-02-11T18:00:00.000Z',
        createdAt: '2026-02-11T18:00:00.000Z',
        updatedAt: '2026-02-11T18:00:00.000Z',
      },
      {
        id: 2,
        title: 'Archived',
        body: 'Old',
        audience: 'all',
        isPinned: false,
        archivedAt: '2026-02-01T18:00:00.000Z',
        publishedBy: 'f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81',
        publishedAt: '2026-02-10T18:00:00.000Z',
        createdAt: '2026-02-10T18:00:00.000Z',
        updatedAt: '2026-02-10T18:00:00.000Z',
      },
    ]);

    createScopedClientMock.mockReturnValue({
      query,
      insert: vi.fn(),
      update: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/announcements?communityId=42');
    const res = await GET(req);
    const json = (await res.json()) as {
      data: Array<{ id: number }>;
    };

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(query).toHaveBeenCalledWith(announcementsTableMock);
    expect(json.data.map((x) => x.id)).toEqual([1]);
  });

  it('GET includes archived entries when includeArchived=true', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: 2,
        title: 'Archived',
        body: 'Old',
        audience: 'all',
        isPinned: false,
        archivedAt: '2026-02-01T18:00:00.000Z',
        publishedBy: 'f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81',
        publishedAt: '2026-02-10T18:00:00.000Z',
        createdAt: '2026-02-10T18:00:00.000Z',
        updatedAt: '2026-02-10T18:00:00.000Z',
      },
    ]);

    createScopedClientMock.mockReturnValue({
      query,
      insert: vi.fn(),
      update: vi.fn(),
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/announcements?communityId=42&includeArchived=true',
    );
    const res = await GET(req);
    const json = (await res.json()) as {
      data: Array<{ id: number }>;
    };

    expect(json.data.map((x) => x.id)).toEqual([2]);
  });

  it('POST create uses scoped insert and writes audit log', async () => {
    const createdRow = {
      id: 9,
      title: 'Board Meeting',
      body: 'Reminder for next week',
      audience: 'all',
      isPinned: false,
      archivedAt: null,
      publishedBy: 'f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81',
      publishedAt: '2026-02-11T18:00:00.000Z',
      createdAt: '2026-02-11T18:00:00.000Z',
      updatedAt: '2026-02-11T18:00:00.000Z',
    };

    const insert = vi.fn().mockResolvedValue([createdRow]);

    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockImplementation(async (table) => {
        if (table === usersTableMock) {
          return [{ id: 'session-user-1', fullName: 'Session User' }];
        }
        return [];
      }),
      insert,
      update: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Board Meeting',
        body: 'Reminder for next week',
        audience: 'all',
        isPinned: false,
        communityId: 200,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const res = await POST(req);
    const json = (await res.json()) as {
      data: { id: number };
    };

    expect(createScopedClientMock).toHaveBeenCalledWith(200);
    expect(insert).toHaveBeenCalledWith(
      announcementsTableMock,
      expect.objectContaining({
        title: 'Board Meeting',
        audience: 'all',
        publishedBy: 'session-user-1',
      }),
    );
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'announcement',
        resourceId: '9',
      }),
    );
    expect(queueAnnouncementDeliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 200,
        announcementId: 9,
        audience: 'all',
      }),
    );
    expect(json.data.id).toBe(9);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(200);
  });

  it('POST create keeps tenant context scoped by body communityId', async () => {
    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockImplementation(async (table) => {
        if (table === usersTableMock) {
          return [{ id: 'session-user-1', fullName: 'Session User' }];
        }
        return [];
      }),
      insert: vi.fn().mockResolvedValue([
        {
          id: 4,
          title: 'Scoped',
          body: 'Scoped body',
          audience: 'all',
          isPinned: false,
          archivedAt: null,
          publishedBy: 'f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81',
          publishedAt: '2026-02-11T18:00:00.000Z',
          createdAt: '2026-02-11T18:00:00.000Z',
          updatedAt: '2026-02-11T18:00:00.000Z',
        },
      ]),
      update: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Scoped',
        body: 'Scoped body',
        audience: 'all',
        isPinned: false,
        communityId: 777,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    await POST(req);
    expect(createScopedClientMock).toHaveBeenCalledWith(777);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(777, 'session-user-1');
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(777);
  });

  it('POST returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Scoped',
        body: 'Scoped body',
        audience: 'all',
        isPinned: false,
        communityId: 777,
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  describe('subscription guard enforcement', () => {
    it('POST returns 403 when guard throws SUBSCRIPTION_REQUIRED', async () => {
      requireActiveSubscriptionForMutationMock.mockRejectedValueOnce(
        new AppError('Your subscription is no longer active. Please reactivate to continue.', 403, 'SUBSCRIPTION_REQUIRED'),
      );

      const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Board Meeting',
          body: 'Reminder for next week',
          audience: 'all',
          isPinned: false,
          communityId: 200,
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });
  });

  describe('POST input validation', () => {
    // TODO (security): filePath is not sanitized against path traversal in documents route.
    it('POST without title returns 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
        method: 'POST',
        body: JSON.stringify({ body: 'No title here', audience: 'all', communityId: 42 }),
        headers: { 'content-type': 'application/json' },
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it('POST with empty body returns 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
        method: 'POST',
        body: JSON.stringify({ title: 'Title', body: '', audience: 'all', communityId: 42 }),
        headers: { 'content-type': 'application/json' },
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it('POST with negative communityId returns 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
        method: 'POST',
        body: JSON.stringify({ title: 'Title', body: 'Body', audience: 'all', communityId: -1 }),
        headers: { 'content-type': 'application/json' },
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });

    it('POST with title exceeding 500 characters returns 400', async () => {
      const longTitle = 'A'.repeat(501);
      const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: longTitle,
          body: 'Valid body',
          audience: 'all',
          isPinned: false,
          communityId: 200,
        }),
        headers: { 'content-type': 'application/json' },
      });
      const res = await POST(req);
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('GET edge cases', () => {
    it('GET returns 401 when requireAuthenticatedUserId throws', async () => {
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const req = new NextRequest('http://localhost:3000/api/v1/announcements?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('GET does NOT call requireActiveSubscriptionForMutation', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/announcements?communityId=42');
      await GET(req);
      expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    });
  });
});
