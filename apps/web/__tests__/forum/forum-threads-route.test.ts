import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  parseCommunityIdFromBodyMock,
  requireCommunityBoardEnabledMock,
  requirePollReadPermissionMock,
  requirePollWritePermissionMock,
  assertNotDemoGraceMock,
  paginateForumThreadsForCommunityMock,
  createForumThreadForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireCommunityBoardEnabledMock: vi.fn(),
  requirePollReadPermissionMock: vi.fn(),
  requirePollWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  paginateForumThreadsForCommunityMock: vi.fn(),
  createForumThreadForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/polls/common', () => ({
  requireCommunityBoardEnabled: requireCommunityBoardEnabledMock,
  requirePollReadPermission: requirePollReadPermissionMock,
  requirePollWritePermission: requirePollWritePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/polls-service', () => ({
  createForumThreadForCommunity: createForumThreadForCommunityMock,
  paginateForumThreadsForCommunity: paginateForumThreadsForCommunityMock,
}));

import { GET, POST } from '../../src/app/api/v1/forum/threads/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident',
  isAdmin: false,
  isUnitOwner: true,
  communityType: 'condo_718',
};

const THREAD_RECORD = {
  id: 22,
  communityId: 42,
  title: 'New thread',
  body: 'Thread body',
  authorUserId: 'user-1',
  isPinned: false,
  isLocked: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeGetRequest(query = '') {
  return new NextRequest(`http://localhost:3000/api/v1/forum/threads?communityId=42${query}`);
}

function makePostRequest(payload: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/v1/forum/threads', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  parseCommunityIdFromQueryMock.mockReturnValue(42);
  parseCommunityIdFromBodyMock.mockImplementation((_req: NextRequest, cid: number) => cid);
  requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
  requireCommunityBoardEnabledMock.mockReturnValue(undefined);
  requirePollReadPermissionMock.mockReturnValue(undefined);
  requirePollWritePermissionMock.mockReturnValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  paginateForumThreadsForCommunityMock.mockResolvedValue({
    data: [],
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  });
  createForumThreadForCommunityMock.mockResolvedValue(THREAD_RECORD);
});

describe('GET /api/v1/forum/threads', () => {
  it('returns runRoute paginated envelope with inner { data, pagination }', async () => {
    paginateForumThreadsForCommunityMock.mockResolvedValueOnce({
      data: [THREAD_RECORD],
      pagination: { nextCursor: 'next-cursor', hasMore: true, pageSize: 1 },
    });

    const response = await GET(makeGetRequest('&cursor=abc&pageSize=1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      data: {
        data: [
          {
            ...THREAD_RECORD,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pagination: { nextCursor: 'next-cursor', hasMore: true, pageSize: 1 },
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(401);
    expect(paginateForumThreadsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when membership check fails', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(403);
    expect(requireCommunityBoardEnabledMock).not.toHaveBeenCalled();
    expect(requirePollReadPermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when board is disabled', async () => {
    requireCommunityBoardEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Community board is not enabled');
    });

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(403);
    expect(requirePollReadPermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls.read permission is denied', async () => {
    requirePollReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(403);
    expect(paginateForumThreadsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid cursor/pageSize query params', async () => {
    const response = await GET(makeGetRequest('&pageSize=abc'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(paginateForumThreadsForCommunityMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/forum/threads', () => {
  it('creates a thread on happy path', async () => {
    const response = await POST(
      makePostRequest(
        { communityId: 42, title: '  New thread  ', body: '  Thread body  ' },
        { 'x-request-id': 'req-1' },
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.id).toBe(22);
    expect(parseCommunityIdFromBodyMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireCommunityBoardEnabledMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(requirePollWritePermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(createForumThreadForCommunityMock).toHaveBeenCalledWith(
      42,
      'user-1',
      {
        title: 'New thread',
        body: 'Thread body',
      },
      'req-1',
    );
  });

  it('forwards null x-request-id when absent (4th positional arg)', async () => {
    const response = await POST(
      makePostRequest({ communityId: 42, title: 'New thread', body: 'Thread body' }),
    );

    expect(response.status).toBe(200);
    const call = createForumThreadForCommunityMock.mock.calls[0];
    expect(call?.[3]).toBeNull();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(
      makePostRequest({ communityId: 42, title: 'New thread', body: 'Thread body' }),
    );

    expect(response.status).toBe(401);
    expect(createForumThreadForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during demo grace guard', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const response = await POST(
      makePostRequest({ communityId: 42, title: 'New thread', body: 'Thread body' }),
    );

    expect(response.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireCommunityBoardEnabledMock).not.toHaveBeenCalled();
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when membership check fails', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const response = await POST(
      makePostRequest({ communityId: 42, title: 'New thread', body: 'Thread body' }),
    );

    expect(response.status).toBe(403);
    expect(requireCommunityBoardEnabledMock).not.toHaveBeenCalled();
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when board is disabled', async () => {
    requireCommunityBoardEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Community board is not enabled');
    });

    const response = await POST(
      makePostRequest({ communityId: 42, title: 'New thread', body: 'Thread body' }),
    );

    expect(response.status).toBe(403);
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls.write permission is denied', async () => {
    requirePollWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const response = await POST(
      makePostRequest({ communityId: 42, title: 'New thread', body: 'Thread body' }),
    );

    expect(response.status).toBe(403);
    expect(createForumThreadForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid payload', async () => {
    const response = await POST(makePostRequest({ communityId: 42, title: '' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(createForumThreadForCommunityMock).not.toHaveBeenCalled();
  });
});
