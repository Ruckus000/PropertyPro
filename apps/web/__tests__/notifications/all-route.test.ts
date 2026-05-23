/**
 * Route unit test — `GET /api/v1/notifications/all`.
 *
 * Added alongside Plan A1 drain #15. Cross-community aggregated
 * notifications feed; single-wrap object response with hand-rolled cursor
 * pagination (numeric id-based, NOT the canonical `paginate()` helper).
 *
 * Coverage:
 *   - Happy path: 2 communities × 2 notifications → merge+sort by id desc,
 *     `nextCursor: null` (no more pages), `totalUnread` summed, each item's
 *     hydrated `community: {id, name, slug}` field correct.
 *   - Empty user-communities short-circuit → returns
 *     `{notifications:[], nextCursor:null, totalUnread:0}` without calling
 *     the per-community service.
 *   - Cursor pagination: services return `limit+1` rows merged → `hasMore`
 *     trips, `nextCursor` is the last item's id, response trimmed to
 *     `limit` items.
 *   - `unreadOnly=true` query → service called with `unreadOnly: true`.
 *   - Default empty-query → Zod resolves `limit=50`, `cursor=undefined`,
 *     `unreadOnly=undefined`; `unreadOnly === 'true'` is `false`.
 *   - 401 (`requireAuthenticatedUserId` rejects) — neither the user-
 *     community lookup nor the per-community service is invoked.
 *   - 400 invalid limit (`?limit=200` exceeds max).
 *   - 400 invalid cursor (`?cursor=-5` fails positive constraint).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  findUserCommunitiesUnscopedMock,
  listCrossCommunityNotificationsForUserMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  findUserCommunitiesUnscopedMock: vi.fn(),
  listCrossCommunityNotificationsForUserMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  findUserCommunitiesUnscoped: findUserCommunitiesUnscopedMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  listCrossCommunityNotificationsForUser: listCrossCommunityNotificationsForUserMock,
}));

import { GET } from '../../src/app/api/v1/notifications/all/route';

interface EnvelopeJson {
  data: {
    notifications: Array<{
      id: number;
      category: string;
      title: string;
      body: string;
      actionUrl: string | null;
      sourceType: string | null;
      sourceId: number | null;
      priority: string;
      readAt: string | null;
      createdAt: string;
      community: { id: number; name: string; slug: string };
    }>;
    nextCursor: number | null;
    totalUnread: number;
  };
}

const USER_ID = 'user-cross-1';

const COMMUNITIES = [
  { communityId: 10, communityName: 'Sunset Condos', slug: 'sunset-condos' },
  { communityId: 20, communityName: 'Palm Shores HOA', slug: 'palm-shores-hoa' },
];

function makeNotification(
  id: number,
  communityId: number,
  overrides: Partial<{
    category: string;
    title: string;
    body: string;
    actionUrl: string | null;
    sourceType: string | null;
    sourceId: number | null;
    priority: string;
    readAt: string | null;
    createdAt: string;
  }> = {},
) {
  return {
    id,
    communityId,
    category: 'general',
    title: `Notification ${id}`,
    body: 'body',
    actionUrl: null,
    sourceType: null,
    sourceId: null,
    priority: 'normal',
    readAt: null,
    createdAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('GET /api/v1/notifications/all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
  });

  it('merges 2 communities × 2 notifications, sorts by id desc, hydrates community meta', async () => {
    findUserCommunitiesUnscopedMock.mockResolvedValueOnce(COMMUNITIES);
    // Each list has 2 items. limit+1 = 51; we'll keep them well below.
    listCrossCommunityNotificationsForUserMock.mockImplementation(
      async ({ communityId }: { communityId: number }) => {
        if (communityId === 10) {
          return {
            list: [makeNotification(101, 10), makeNotification(99, 10)],
            unread: 3,
          };
        }
        return {
          list: [makeNotification(102, 20), makeNotification(100, 20)],
          unread: 5,
        };
      },
    );

    const req = new NextRequest('http://localhost:3000/api/v1/notifications/all');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json.data.notifications.map((n) => n.id)).toEqual([102, 101, 100, 99]);
    expect(json.data.nextCursor).toBeNull();
    expect(json.data.totalUnread).toBe(8);

    // community meta hydrated correctly per row
    expect(json.data.notifications[0]!.community).toEqual({
      id: 20,
      name: 'Palm Shores HOA',
      slug: 'palm-shores-hoa',
    });
    expect(json.data.notifications[1]!.community).toEqual({
      id: 10,
      name: 'Sunset Condos',
      slug: 'sunset-condos',
    });
    expect(json.data.notifications[2]!.community).toEqual({
      id: 20,
      name: 'Palm Shores HOA',
      slug: 'palm-shores-hoa',
    });
    expect(json.data.notifications[3]!.community).toEqual({
      id: 10,
      name: 'Sunset Condos',
      slug: 'sunset-condos',
    });

    // Empty-query defaults: limit=50, cursor=undefined, unreadOnly=false.
    expect(listCrossCommunityNotificationsForUserMock).toHaveBeenCalledTimes(2);
    expect(listCrossCommunityNotificationsForUserMock).toHaveBeenCalledWith({
      communityId: 10,
      userId: USER_ID,
      cursor: undefined,
      limitPlusOne: 51,
      unreadOnly: false,
    });
    expect(listCrossCommunityNotificationsForUserMock).toHaveBeenCalledWith({
      communityId: 20,
      userId: USER_ID,
      cursor: undefined,
      limitPlusOne: 51,
      unreadOnly: false,
    });
  });

  it('short-circuits with empty result when the user has no communities', async () => {
    findUserCommunitiesUnscopedMock.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost:3000/api/v1/notifications/all');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json).toEqual({
      data: { notifications: [], nextCursor: null, totalUnread: 0 },
    });
    expect(listCrossCommunityNotificationsForUserMock).not.toHaveBeenCalled();
  });

  it('sets nextCursor to the last page item id when hasMore trips', async () => {
    findUserCommunitiesUnscopedMock.mockResolvedValueOnce([COMMUNITIES[0]!]);

    // limit=2 → limitPlusOne=3. Return 3 rows. After page-cap to 2,
    // nextCursor = last surviving row's id.
    listCrossCommunityNotificationsForUserMock.mockResolvedValueOnce({
      list: [
        makeNotification(303, 10),
        makeNotification(302, 10),
        makeNotification(301, 10),
      ],
      unread: 1,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/notifications/all?limit=2');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json.data.notifications.map((n) => n.id)).toEqual([303, 302]);
    expect(json.data.nextCursor).toBe(302);
    expect(json.data.totalUnread).toBe(1);
    expect(listCrossCommunityNotificationsForUserMock).toHaveBeenCalledWith({
      communityId: 10,
      userId: USER_ID,
      cursor: undefined,
      limitPlusOne: 3,
      unreadOnly: false,
    });
  });

  it('forwards unreadOnly=true to the per-community service', async () => {
    findUserCommunitiesUnscopedMock.mockResolvedValueOnce([COMMUNITIES[0]!]);
    listCrossCommunityNotificationsForUserMock.mockResolvedValueOnce({
      list: [],
      unread: 0,
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/all?unreadOnly=true&limit=10',
    );
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ notifications: [], nextCursor: null, totalUnread: 0 });
    expect(listCrossCommunityNotificationsForUserMock).toHaveBeenCalledWith({
      communityId: 10,
      userId: USER_ID,
      cursor: undefined,
      limitPlusOne: 11,
      unreadOnly: true,
    });
  });

  it('forwards unreadOnly=false to the per-community service (exercises the other enum branch)', async () => {
    findUserCommunitiesUnscopedMock.mockResolvedValueOnce([COMMUNITIES[0]!]);
    listCrossCommunityNotificationsForUserMock.mockResolvedValueOnce({
      list: [],
      unread: 0,
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/all?unreadOnly=false&limit=10',
    );
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ notifications: [], nextCursor: null, totalUnread: 0 });
    // The `unreadOnly === 'true'` check inside the handler converts the 'false'
    // enum value to a literal boolean false — distinct branch from the
    // undefined-then-default path, even though both evaluate to false.
    expect(listCrossCommunityNotificationsForUserMock).toHaveBeenCalledWith({
      communityId: 10,
      userId: USER_ID,
      cursor: undefined,
      limitPlusOne: 11,
      unreadOnly: false,
    });
  });

  it('forwards a numeric cursor verbatim to the per-community service', async () => {
    findUserCommunitiesUnscopedMock.mockResolvedValueOnce([COMMUNITIES[0]!]);
    listCrossCommunityNotificationsForUserMock.mockResolvedValueOnce({
      list: [],
      unread: 0,
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/all?cursor=999&limit=25',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(listCrossCommunityNotificationsForUserMock).toHaveBeenCalledWith({
      communityId: 10,
      userId: USER_ID,
      cursor: 999,
      limitPlusOne: 26,
      unreadOnly: false,
    });
  });

  it('de-dups communities when the user has multiple roles per community', async () => {
    // Same communityId returned twice (e.g. user is both owner and board_member).
    findUserCommunitiesUnscopedMock.mockResolvedValueOnce([
      COMMUNITIES[0]!,
      { ...COMMUNITIES[0]! },
    ]);
    listCrossCommunityNotificationsForUserMock.mockResolvedValueOnce({
      list: [],
      unread: 0,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/notifications/all');
    const res = await GET(req);

    expect(res.status).toBe(200);
    // Service called ONCE despite duplicate community in source data.
    expect(listCrossCommunityNotificationsForUserMock).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when unauthenticated and never invokes the community lookup', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/notifications/all');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(findUserCommunitiesUnscopedMock).not.toHaveBeenCalled();
    expect(listCrossCommunityNotificationsForUserMock).not.toHaveBeenCalled();
  });

  it('returns 400 when limit exceeds the upper bound (>100)', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/all?limit=200',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(findUserCommunitiesUnscopedMock).not.toHaveBeenCalled();
    expect(listCrossCommunityNotificationsForUserMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-positive cursor', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/all?cursor=-5',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(findUserCommunitiesUnscopedMock).not.toHaveBeenCalled();
    expect(listCrossCommunityNotificationsForUserMock).not.toHaveBeenCalled();
  });
});
