/**
 * Route unit tests — `GET`, `PATCH`, `DELETE /api/v1/forum/threads/[id]`.
 *
 * Added alongside Plan A1 drain #117.
 */
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
  requireForumModerationPermissionMock,
  assertNotDemoGraceMock,
  getForumThreadWithRepliesForCommunityMock,
  updateForumThreadForCommunityMock,
  deleteForumThreadForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireCommunityBoardEnabledMock: vi.fn(),
  requirePollReadPermissionMock: vi.fn(),
  requirePollWritePermissionMock: vi.fn(),
  requireForumModerationPermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getForumThreadWithRepliesForCommunityMock: vi.fn(),
  updateForumThreadForCommunityMock: vi.fn(),
  deleteForumThreadForCommunityMock: vi.fn(),
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
  requireForumModerationPermission: requireForumModerationPermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/polls-service', () => ({
  getForumThreadWithRepliesForCommunity: getForumThreadWithRepliesForCommunityMock,
  updateForumThreadForCommunity: updateForumThreadForCommunityMock,
  deleteForumThreadForCommunity: deleteForumThreadForCommunityMock,
}));

import { GET, PATCH, DELETE } from '../../src/app/api/v1/forum/threads/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin',
  communityId: 42,
  role: 'manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Manager',
  communityType: 'condo_718' as const,
};

const THREAD = {
  id: 7,
  communityId: 42,
  title: 'Pool hours',
  body: 'Updated schedule',
  isPinned: false,
  isLocked: false,
  replies: [],
};

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/forum/threads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireCommunityBoardEnabledMock.mockReturnValue(undefined);
    requirePollReadPermissionMock.mockReturnValue(undefined);
    getForumThreadWithRepliesForCommunityMock.mockResolvedValue(THREAD);
  });

  it('returns thread detail wrapped in { data }', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/forum/threads/7?communityId=42',
    );
    const res = await GET(req, routeCtx('7'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: THREAD });
    expect(getForumThreadWithRepliesForCommunityMock).toHaveBeenCalledWith(42, 7);
  });

  it('requires auth before communityId parse', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const req = new NextRequest(
      'http://localhost:3000/api/v1/forum/threads/7?communityId=42',
    );

    const res = await GET(req, routeCtx('7'));
    expect(res.status).toBe(401);
    expect(parseCommunityIdFromQueryMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/forum/threads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    parseCommunityIdFromBodyMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireCommunityBoardEnabledMock.mockReturnValue(undefined);
    requirePollWritePermissionMock.mockReturnValue(undefined);
    requireForumModerationPermissionMock.mockReturnValue(undefined);
    updateForumThreadForCommunityMock.mockResolvedValue({ ...THREAD, title: 'New title' });
  });

  it('updates thread and returns { data }', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/forum/threads/7', {
      method: 'PATCH',
      body: JSON.stringify({ communityId: 42, title: 'New title' }),
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
    });
    const res = await PATCH(req, routeCtx('7'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.title).toBe('New title');
    expect(updateForumThreadForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin',
      { title: 'New title', body: undefined, isPinned: undefined, isLocked: undefined },
      'req-1',
    );
  });

  it('returns 401 for unauthenticated PATCH before empty-field check', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const req = new NextRequest('http://localhost:3000/api/v1/forum/threads/7', {
      method: 'PATCH',
      body: JSON.stringify({ communityId: 42 }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req, routeCtx('7'));
    expect(res.status).toBe(401);
    expect(updateForumThreadForCommunityMock).not.toHaveBeenCalled();
  });

  it('rejects empty PATCH body fields', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/forum/threads/7', {
      method: 'PATCH',
      body: JSON.stringify({ communityId: 42 }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req, routeCtx('7'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toBe('At least one field must be provided for update');
  });
});

describe('DELETE /api/v1/forum/threads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireCommunityBoardEnabledMock.mockReturnValue(undefined);
    requirePollWritePermissionMock.mockReturnValue(undefined);
    requireForumModerationPermissionMock.mockReturnValue(undefined);
    deleteForumThreadForCommunityMock.mockResolvedValue(undefined);
  });

  it('deletes thread and returns tight { data: { id, deleted: true } }', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/forum/threads/7?communityId=42',
      { method: 'DELETE', headers: { 'x-request-id': 'req-del' } },
    );
    const res = await DELETE(req, routeCtx('7'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: { id: 7, deleted: true } });
    expect(deleteForumThreadForCommunityMock).toHaveBeenCalledWith(42, 7, 'user-admin', 'req-del');
  });

  it('blocks demo-grace communities', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo grace'));
    const req = new NextRequest(
      'http://localhost:3000/api/v1/forum/threads/7?communityId=42',
      { method: 'DELETE' },
    );

    const res = await DELETE(req, routeCtx('7'));
    expect(res.status).toBe(403);
  });
});
