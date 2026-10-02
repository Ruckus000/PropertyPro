/**
 * Unit tests — `POST /api/v1/invitations/batch`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { NotFoundError } from '../../src/lib/api/errors/NotFoundError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  getCommunityNameMock,
  sendInvitationMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getCommunityNameMock: vi.fn(),
  sendInvitationMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireCommunityMembershipMock }));
vi.mock('@/lib/api/tenant-context', () => ({ resolveEffectiveCommunityId: (_req: unknown, id: number) => id }));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: requirePermissionMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/services/invitations-service', () => ({ getCommunityNameForInvitation: getCommunityNameMock }));
vi.mock('@/lib/invitations/send-community-invitation', () => ({
  sendCommunityInvitation: sendInvitationMock,
  inviterNameFrom: () => 'Pat Manager',
}));
vi.mock('@sentry/nextjs', () => ({ captureException: captureExceptionMock }));

import { POST } from '../../src/app/api/v1/invitations/batch/route';
import { resetGlobalRateLimiter } from '../../src/lib/middleware/rate-limiter';

const post = (userIds: unknown) =>
  POST(
    new NextRequest('http://localhost:3000/api/v1/invitations/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, userIds }),
    }),
  );

describe('POST /api/v1/invitations/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    requireCommunityMembershipMock.mockResolvedValue({ communityId: 42, role: 'property_manager' });
    requirePermissionMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    getCommunityNameMock.mockResolvedValue({ name: 'Sunset Condos' });
    sendInvitationMock.mockResolvedValue(undefined);
    resetGlobalRateLimiter();
  });

  it('is refused whole (429) when it would take the manager past 100 emails a minute', async () => {
    const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => `u${from + i}`);
    expect((await post(ids(0, 60))).status).toBe(200);
    expect(sendInvitationMock).toHaveBeenCalledTimes(60);
    const refused = await post(ids(100, 41));
    expect(refused.status).toBe(429);
    expect(sendInvitationMock).toHaveBeenCalledTimes(60); // nothing more sent
    // A different manager has their own budget.
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-2');
    expect((await post(ids(200, 41))).status).toBe(200);
  });

  it('sends each user through the shared sender and reports every result', async () => {
    const res = await post(['u1', 'u2']);
    expect(res.status).toBe(200);
    expect((await res.json()).data.results).toEqual([
      { userId: 'u1', status: 'sent' },
      { userId: 'u2', status: 'sent' },
    ]);
    expect(sendInvitationMock).toHaveBeenCalledWith({
      communityId: 42,
      communityName: 'Sunset Condos',
      userId: 'u1',
      actorUserId: 'actor-1',
      inviterName: 'Pat Manager',
      ttlDays: undefined,
    });
  });

  it('one failure does not stop the rest; only unexpected errors go to Sentry', async () => {
    sendInvitationMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NotFoundError('User u2 is not a member of community 42'))
      .mockRejectedValueOnce(new Error('smtp exploded'))
      .mockResolvedValueOnce(undefined);

    const res = await post(['u1', 'u2', 'u3', 'u4']);
    expect((await res.json()).data.results).toEqual([
      { userId: 'u1', status: 'sent' },
      { userId: 'u2', status: 'failed', error: 'User u2 is not a member of community 42' },
      { userId: 'u3', status: 'failed', error: 'Could not send the invitation' },
      { userId: 'u4', status: 'sent' },
    ]);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('sends a duplicated id once', async () => {
    await post(['u1', 'u1']);
    expect(sendInvitationMock).toHaveBeenCalledTimes(1);
  });

  it('is refused without residents:write and sends nothing', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('no');
    });
    expect((await post(['u1'])).status).toBe(403);
    expect(sendInvitationMock).not.toHaveBeenCalled();
  });

  it.each([[[]], [Array.from({ length: 101 }, (_, i) => `u${i}`)]])('rejects %# out-of-range batches', async (ids) => {
    expect((await post(ids)).status).toBe(400);
    expect(sendInvitationMock).not.toHaveBeenCalled();
  });
});
