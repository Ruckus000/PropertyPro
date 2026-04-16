import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  assertNotDemoGraceMock,
  createForumReplyForCommunityMock,
  deleteForumReplyForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  createForumReplyForCommunityMock: vi.fn(),
  deleteForumReplyForCommunityMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/finance/common', () => ({
  parsePositiveInt: (value: string, label: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${label} must be a positive integer`);
    }
    return parsed;
  },
}));

vi.mock('@/lib/services/polls-service', () => ({
  createForumReplyForCommunity: createForumReplyForCommunityMock,
  deleteForumReplyForCommunity: deleteForumReplyForCommunityMock,
}));

import { DELETE } from '../../src/app/api/v1/forum/threads/[id]/reply/route';

const ADMIN_MEMBERSHIP = {
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  presetKey: 'board_president',
  communityType: 'condo_718',
  permissions: {
    resources: {
      polls: { read: true, write: true },
    },
  },
};

const RESIDENT_MEMBERSHIP = {
  role: 'resident',
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  presetKey: 'owner',
  communityType: 'condo_718',
  permissions: {
    resources: {
      polls: { read: true, write: false },
    },
  },
};

const LIMITED_MANAGER_MEMBERSHIP = {
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Manager',
  presetKey: 'cam',
  communityType: 'condo_718',
  permissions: {
    resources: {
      polls: { read: true, write: false },
    },
  },
};

describe('forum reply moderation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('moderator-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
  });

  it('allows moderators to soft-delete replies through the existing reply route', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/forum/threads/7/reply', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-forum-delete',
      },
      body: JSON.stringify({
        communityId: 42,
        replyId: 99,
      }),
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: '7' }) });
    const json = (await res.json()) as { data: { id: number; deleted: boolean } };

    expect(res.status).toBe(200);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'moderator-1');
    expect(deleteForumReplyForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      99,
      'moderator-1',
      'req-forum-delete',
      undefined,
    );
    expect(json.data).toEqual({ id: 99, deleted: true });
  });

  it('rejects residents attempting to moderate replies', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(RESIDENT_MEMBERSHIP);

    const req = new NextRequest('http://localhost:3000/api/v1/forum/threads/7/reply', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        replyId: 99,
      }),
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: '7' }) });
    const json = (await res.json()) as { error: { message: string; code: string } };

    expect(res.status).toBe(403);
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('rejects managers without polls write permission', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(LIMITED_MANAGER_MEMBERSHIP);

    const req = new NextRequest('http://localhost:3000/api/v1/forum/threads/7/reply', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        replyId: 99,
      }),
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: '7' }) });
    const json = (await res.json()) as { error: { message: string; code: string } };

    expect(res.status).toBe(403);
    expect(deleteForumReplyForCommunityMock).not.toHaveBeenCalled();
    expect(json.error.code).toBe('FORBIDDEN');
  });
});
