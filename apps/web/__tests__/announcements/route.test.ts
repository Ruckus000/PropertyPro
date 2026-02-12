import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  auditLogMock,
  announcementsTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  auditLogMock: vi.fn().mockResolvedValue(undefined),
  announcementsTableMock: {
    id: Symbol('announcements.id'),
  },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  announcements: announcementsTableMock,
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

import { GET, POST } from '../../src/app/api/v1/announcements/route';

describe('p1-17 announcements route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');

    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
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
      query: vi.fn().mockResolvedValue([]),
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
    expect(json.data.id).toBe(9);
  });

  it('POST create keeps tenant context scoped by body communityId', async () => {
    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
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
});
