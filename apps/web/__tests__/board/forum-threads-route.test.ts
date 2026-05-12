/**
 * Unit tests for `/api/v1/forum/threads` GET - ordered-keyset pagination.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  requireCommunityBoardEnabledMock,
  requirePollReadPermissionMock,
  paginateForumThreadsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireCommunityBoardEnabledMock: vi.fn(),
  requirePollReadPermissionMock: vi.fn(),
  paginateForumThreadsForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: vi.fn(),
}));

vi.mock('@/lib/polls/common', () => ({
  requireCommunityBoardEnabled: requireCommunityBoardEnabledMock,
  requirePollReadPermission: requirePollReadPermissionMock,
  requirePollWritePermission: vi.fn(),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/polls-service', () => ({
  createForumThreadForCommunity: vi.fn(),
  paginateForumThreadsForCommunity: paginateForumThreadsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/forum/threads/route';

const membership = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident',
  isAdmin: false,
  isUnitOwner: true,
  communityType: 'condo_718',
};

function makeRequest(query = '') {
  return new NextRequest(`http://localhost:3000/api/v1/forum/threads?communityId=42${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  parseCommunityIdFromQueryMock.mockReturnValue(42);
  requireCommunityMembershipMock.mockResolvedValue(membership);
  requireCommunityBoardEnabledMock.mockReturnValue(undefined);
  requirePollReadPermissionMock.mockReturnValue(undefined);
  paginateForumThreadsForCommunityMock.mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  });
});

describe('GET /api/v1/forum/threads', () => {
  it('returns the canonical double-wrapped paginated response shape', async () => {
    paginateForumThreadsForCommunityMock.mockResolvedValueOnce({
      data: [{ id: 2, title: 'Pinned', isPinned: true }],
      pagination: { nextCursor: 'next-cursor', hasMore: true, pageSize: 1 },
    });

    const response = await GET(makeRequest('&pageSize=1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      data: {
        data: [{ id: 2, title: 'Pinned', isPinned: true }],
        pagination: { nextCursor: 'next-cursor', hasMore: true, pageSize: 1 },
      },
    });
  });

  it('passes cursor and pageSize to the ordered-keyset service', async () => {
    await GET(makeRequest('&cursor=abc123&pageSize=2'));

    expect(paginateForumThreadsForCommunityMock).toHaveBeenCalledWith({
      communityId: 42,
      cursor: 'abc123',
      pageSize: 2,
    });
  });

  it('treats empty cursor and pageSize query params as missing', async () => {
    await GET(makeRequest('&cursor=&pageSize='));

    expect(paginateForumThreadsForCommunityMock).toHaveBeenCalledWith({
      communityId: 42,
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('rejects invalid pageSize before calling the pagination service', async () => {
    const response = await GET(makeRequest('&pageSize=abc'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(paginateForumThreadsForCommunityMock).not.toHaveBeenCalled();
  });

  it('applies board/read membership gates before pagination', async () => {
    requirePollReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('No forum read access');
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
    expect(requireCommunityBoardEnabledMock).toHaveBeenCalledWith(membership);
    expect(requirePollReadPermissionMock).toHaveBeenCalledWith(membership);
    expect(paginateForumThreadsForCommunityMock).not.toHaveBeenCalled();
  });
});
