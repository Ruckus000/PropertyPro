/**
 * Route unit tests — `POST` + `DELETE /api/v1/forum/threads/[id]/reply`.
 *
 * Added alongside Plan A1 drain #90. Covers the contracted runRoute envelope
 * for both methods: happy paths (admin moderator delete, non-admin author
 * delete, admin without polls/write capability, moderationReason present /
 * absent, x-request-id forwarding), validation errors (params.id and body
 * shapes), and the full auth-chain 401 / 403 surface
 * (`assertNotDemoGrace`, `requireCommunityMembership`,
 * `requireCommunityBoardEnabled`, `requirePollWritePermission`).
 *
 * Critical behavioral assertion: the DELETE handler computes
 * `canModerateReplies = membership.isAdmin && checkPermissionV2(...)`. When
 * `isAdmin === false`, the `&&` short-circuits and `checkPermissionV2` MUST
 * NOT be called. The two non-admin tests verify this.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireCommunityBoardEnabledMock,
  requirePollWritePermissionMock,
  assertNotDemoGraceMock,
  checkPermissionV2Mock,
  createForumReplyForCommunityMock,
  deleteForumReplyForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireCommunityBoardEnabledMock: vi.fn(),
  requirePollWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  checkPermissionV2Mock: vi.fn(),
  createForumReplyForCommunityMock: vi.fn(),
  deleteForumReplyForCommunityMock: vi.fn(),
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

vi.mock('@/lib/polls/common', () => ({
  requireCommunityBoardEnabled: requireCommunityBoardEnabledMock,
  requirePollWritePermission: requirePollWritePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  checkPermissionV2: checkPermissionV2Mock,
}));

vi.mock('@/lib/services/polls-service', () => ({
  createForumReplyForCommunity: createForumReplyForCommunityMock,
  deleteForumReplyForCommunity: deleteForumReplyForCommunityMock,
}));

import { POST, DELETE } from '../../src/app/api/v1/forum/threads/[id]/reply/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin',
  communityId: 42,
  role: 'manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
  permissions: { resources: { polls: { read: true, write: true } } } as unknown as Record<string, unknown>,
};

const RESIDENT_MEMBERSHIP = {
  userId: 'user-resident',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
  permissions: {} as Record<string, unknown>,
};

const REPLY_RECORD = {
  id: 99,
  communityId: 42,
  threadId: 7,
  body: 'reply body',
  authorUserId: 'user-admin',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/forum/threads/${id}/reply`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function jsonDelete(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/forum/threads/${id}/reply`,
    {
      method: 'DELETE',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/v1/forum/threads/[id]/reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireCommunityBoardEnabledMock.mockReturnValue(undefined);
    requirePollWritePermissionMock.mockReturnValue(undefined);
    createForumReplyForCommunityMock.mockResolvedValue(REPLY_RECORD);
  });

  it('creates a forum reply (happy path)', async () => {
    const res = await POST(
      jsonPost(
        7,
        { communityId: 42, body: 'a great reply' },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; threadId: number; body: string } };
    expect(json.data.id).toBe(99);
    expect(json.data.threadId).toBe(7);
    expect(json.data.body).toBe('reply body');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin');
    expect(requireCommunityBoardEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requirePollWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(createForumReplyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin',
      'a great reply',
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost(7, { communityId: 42, body: 'reply' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42, body: 'reply' }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      jsonPost('0', { communityId: 42, body: 'reply' }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(7, { body: 'reply' }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body field is empty', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, body: '' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body exceeds 8000 chars', async () => {
    const longBody = 'a'.repeat(8001);
    const res = await POST(
      jsonPost(7, { communityId: 42, body: longBody }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      jsonPost(7, { communityId: 42, body: 'reply' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireCommunityBoardEnabledMock).not.toHaveBeenCalled();
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      jsonPost(7, { communityId: 42, body: 'reply' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityBoardEnabledMock).not.toHaveBeenCalled();
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the community board is not enabled', async () => {
    requireCommunityBoardEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Community board is not enabled');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, body: 'reply' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls.write permission is denied', async () => {
    requirePollWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, body: 'reply' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(createForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, body: 'reply' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = createForumReplyForCommunityMock.mock.calls[0];
    expect(call?.[4]).toBeNull();
  });
});

describe('DELETE /api/v1/forum/threads/[id]/reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireCommunityBoardEnabledMock.mockReturnValue(undefined);
    requirePollWritePermissionMock.mockReturnValue(undefined);
    checkPermissionV2Mock.mockReturnValue(true);
    deleteForumReplyForCommunityMock.mockResolvedValue(undefined);
  });

  it('admin moderator delete (happy path, canModerateReplies=true)', async () => {
    const res = await DELETE(
      jsonDelete(
        7,
        { communityId: 42, replyId: 99 },
        { 'x-request-id': 'req-mod-delete' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; deleted: boolean } };
    expect(json.data).toEqual({ id: 99, deleted: true });
    expect(checkPermissionV2Mock).toHaveBeenCalledWith(
      'manager',
      'condo_718',
      'polls',
      'write',
      { isUnitOwner: false, permissions: ADMIN_MEMBERSHIP.permissions },
    );
    expect(deleteForumReplyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      99,
      'user-admin',
      true,
      'req-mod-delete',
      undefined,
    );
  });

  it('non-admin author delete short-circuits checkPermissionV2 (canModerateReplies=false)', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('user-resident');

    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    // CRITICAL: the `&&` short-circuits when isAdmin === false; checkPermissionV2 MUST NOT be called.
    expect(checkPermissionV2Mock).not.toHaveBeenCalled();
    expect(deleteForumReplyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      99,
      'user-resident',
      false,
      null,
      undefined,
    );
  });

  it('admin delete where checkPermissionV2 returns false (canModerateReplies=false)', async () => {
    checkPermissionV2Mock.mockReturnValueOnce(false);

    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(checkPermissionV2Mock).toHaveBeenCalledTimes(1);
    expect(deleteForumReplyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      99,
      'user-admin',
      false,
      null,
      undefined,
    );
  });

  it('forwards moderationReason as the 7th positional arg when provided', async () => {
    const res = await DELETE(
      jsonDelete(7, {
        communityId: 42,
        replyId: 99,
        moderationReason: 'Off-topic content',
      }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = deleteForumReplyForCommunityMock.mock.calls[0];
    expect(call?.[6]).toBe('Off-topic content');
  });

  it('passes undefined as the 7th arg when moderationReason is omitted', async () => {
    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = deleteForumReplyForCommunityMock.mock.calls[0];
    expect(call?.[6]).toBeUndefined();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when replyId is missing', async () => {
    const res = await DELETE(
      jsonDelete(7, { communityId: 42 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await DELETE(jsonDelete(7, { replyId: 99 }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when moderationReason exceeds 500 chars', async () => {
    const longReason = 'x'.repeat(501);
    const res = await DELETE(
      jsonDelete(7, {
        communityId: 42,
        replyId: 99,
        moderationReason: longReason,
      }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireCommunityBoardEnabledMock).not.toHaveBeenCalled();
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
    expect(checkPermissionV2Mock).not.toHaveBeenCalled();
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityBoardEnabledMock).not.toHaveBeenCalled();
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
    expect(checkPermissionV2Mock).not.toHaveBeenCalled();
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the community board is not enabled', async () => {
    requireCommunityBoardEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Community board is not enabled');
    });

    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
    expect(checkPermissionV2Mock).not.toHaveBeenCalled();
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls.write permission is denied', async () => {
    requirePollWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(checkPermissionV2Mock).not.toHaveBeenCalled();
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent (6th positional arg)', async () => {
    const res = await DELETE(
      jsonDelete(7, { communityId: 42, replyId: 99 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = deleteForumReplyForCommunityMock.mock.calls[0];
    expect(call?.[5]).toBeNull();
  });
});
