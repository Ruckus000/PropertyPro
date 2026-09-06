/**
 * Route unit tests — `POST /api/v1/polls/[id]/vote`.
 *
 * Added alongside Plan A1 drain #62. Covers the contracted runRoute envelope:
 * happy path, 401 unauth, 400 params.id (non-numeric / zero), 400 body
 * (missing communityId / missing selectedOptions / empty array / >20 entries
 * / per-element empty string / per-element >240 chars), 403 demo-grace,
 * 403 non-member, 403 polls-disabled, 403 polls-write-permission, and
 * x-request-id null forwarding.
 *
 * Note: this is the RESIDENT-facing vote endpoint and intentionally has no
 * admin-role gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePollsEnabledMock,
  requirePollWritePermissionMock,
  assertNotDemoGraceMock,
  castPollVoteForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePollsEnabledMock: vi.fn(),
  requirePollWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  castPollVoteForCommunityMock: vi.fn(),
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
  requirePollsEnabled: requirePollsEnabledMock,
  requirePollWritePermission: requirePollWritePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/polls-service', () => ({
  castPollVoteForCommunity: castPollVoteForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/polls/[id]/vote/route';

const RESIDENT_MEMBERSHIP = {
  userId: 'user-resident-1',
  communityId: 42,
  role: 'owner' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const VOTE_RESULT = {
  id: 99,
  pollId: 7,
  castAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/polls/${id}/vote`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/v1/polls/[id]/vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    requirePollsEnabledMock.mockReturnValue(undefined);
    requirePollWritePermissionMock.mockReturnValue(undefined);
    castPollVoteForCommunityMock.mockResolvedValue(VOTE_RESULT);
  });

  it('casts a poll vote (happy path)', async () => {
    const res = await POST(
      jsonPost(
        7,
        { communityId: 42, selectedOptions: ['option-a', 'option-b'] },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; pollId: number } };
    expect(json.data.id).toBe(99);
    expect(json.data.pollId).toBe(7);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-resident-1');
    expect(requirePollsEnabledMock).toHaveBeenCalledWith(RESIDENT_MEMBERSHIP);
    expect(requirePollWritePermissionMock).toHaveBeenCalledWith(RESIDENT_MEMBERSHIP);
    expect(castPollVoteForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident-1',
      { selectedOptions: ['option-a', 'option-b'] },
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: ['x'] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(
      jsonPost('abc', { communityId: 42, selectedOptions: ['x'] }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(
      jsonPost('0', { communityId: 42, selectedOptions: ['x'] }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(
      jsonPost(7, { selectedOptions: ['x'] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing selectedOptions', async () => {
    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when selectedOptions is an empty array', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: [] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when selectedOptions exceeds 20 entries', async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `opt-${i}`);
    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: tooMany }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when a selectedOptions element is the empty string', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: [''] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when a selectedOptions element exceeds 240 chars', async () => {
    const tooLong = 'a'.repeat(241);
    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: [tooLong] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: ['x'] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePollsEnabledMock).not.toHaveBeenCalled();
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: ['x'] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePollsEnabledMock).not.toHaveBeenCalled();
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls are disabled for the community', async () => {
    requirePollsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Polls not enabled');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: ['x'] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePollWritePermissionMock).not.toHaveBeenCalled();
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls.write permission is denied', async () => {
    requirePollWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: ['x'] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(castPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, selectedOptions: ['x'] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = castPollVoteForCommunityMock.mock.calls[0]!;
    expect(call[4]).toBeNull();
  });
});
