/**
 * Route unit tests — `GET /api/v1/notifications`.
 *
 * Plan A1 drain #103. Covers paginated runRoute envelope, manual `unread_only`
 * parsing, category filter, auth chain, and service arg forwarding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  paginateNotificationsForUserMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  paginateNotificationsForUserMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@/lib/services/notification-service', () => ({
  paginateNotificationsForUser: paginateNotificationsForUserMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET } from '../../src/app/api/v1/notifications/route';

const COMMUNITY_ID = 42;
const USER_ID = 'user-123';

const NOTIFICATION_ROW = {
  id: 1,
  communityId: COMMUNITY_ID,
  userId: USER_ID,
  category: 'announcement',
  title: 'New announcement',
  body: null,
  actionUrl: null,
  sourceType: 'announcement',
  sourceId: '1',
  priority: 'normal',
  readAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: '2026-05-01T12:00:00Z',
};

const PAGINATION = { nextCursor: null, hasMore: false, pageSize: 20 };

interface PaginatedJson {
  data: {
    data: unknown[];
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  };
}

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;
function getReq(url: string, init?: NextRequestInit): NextRequest {
  return new NextRequest(url, init);
}

describe('GET /api/v1/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    requireCommunityMembershipMock.mockResolvedValue({
      userId: USER_ID,
      communityId: COMMUNITY_ID,
      role: 'owner',
      isAdmin: false,
      isUnitOwner: true,
      displayTitle: 'Owner',
      communityType: 'condo_718',
    });
    paginateNotificationsForUserMock.mockResolvedValue({
      data: [NOTIFICATION_ROW],
      pagination: PAGINATION,
    });
  });

  it('returns the canonical paginated envelope without cursor', async () => {
    const res = await GET(getReq(`http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}`));

    expect(res.status).toBe(200);
    const json = (await res.json()) as PaginatedJson;
    expect(json.data.data).toEqual([NOTIFICATION_ROW]);
    expect(json.data.pagination).toEqual(PAGINATION);
    expect(paginateNotificationsForUserMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      userId: USER_ID,
      cursor: undefined,
      pageSize: 20,
      category: undefined,
      unreadOnly: false,
    });
  });

  it('forwards cursor and limit to the service', async () => {
    paginateNotificationsForUserMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'opaque-next', hasMore: true, pageSize: 10 },
    });

    const res = await GET(
      getReq(
        `http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}&cursor=abc&limit=10`,
      ),
    );

    expect(res.status).toBe(200);
    expect(paginateNotificationsForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: 'abc',
        pageSize: 10,
      }),
    );
  });

  it('rejects invalid limit with 400', async () => {
    const res = await GET(
      getReq(`http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}&limit=-1`),
    );

    expect(res.status).toBe(400);
    expect(paginateNotificationsForUserMock).not.toHaveBeenCalled();
  });

  it('passes unreadOnly=true only for literal unread_only=true', async () => {
    await GET(
      getReq(
        `http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}&unread_only=true`,
      ),
    );

    expect(paginateNotificationsForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ unreadOnly: true }),
    );
  });

  it('treats unread_only=false as filter-off', async () => {
    await GET(
      getReq(
        `http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}&unread_only=false`,
      ),
    );

    expect(paginateNotificationsForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ unreadOnly: false }),
    );
  });

  it('treats garbage unread_only as filter-off', async () => {
    await GET(
      getReq(
        `http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}&unread_only=garbage`,
      ),
    );

    expect(paginateNotificationsForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ unreadOnly: false }),
    );
  });

  it('forwards a valid category filter', async () => {
    await GET(
      getReq(
        `http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}&category=meeting`,
      ),
    );

    expect(paginateNotificationsForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'meeting' }),
    );
  });

  it('rejects invalid category with 400', async () => {
    const res = await GET(
      getReq(
        `http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}&category=bogus`,
      ),
    );

    expect(res.status).toBe(400);
    expect(paginateNotificationsForUserMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(getReq(`http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}`));
    expect(res.status).toBe(401);
    expect(paginateNotificationsForUserMock).not.toHaveBeenCalled();
  });

  it('returns 403 when not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const res = await GET(getReq(`http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}`));
    expect(res.status).toBe(403);
    expect(paginateNotificationsForUserMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with query', async () => {
    const res = await GET(
      getReq(`http://localhost:3000/api/v1/notifications?communityId=${COMMUNITY_ID}`, {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(paginateNotificationsForUserMock).not.toHaveBeenCalled();
  });
});
