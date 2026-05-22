/**
 * Route unit test — `GET /api/v1/polls/[id]/my-vote`.
 *
 * Added alongside the Plan A1 drain #11. Covers the multi-gate auth
 * chain (auth → community resolve → membership → polls-enabled → poll-
 * read-permission), the runner's params+query validation envelope, and
 * both "has voted" / "has not voted" response shapes returned by
 * `getMyPollVoteForCommunity`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePollsEnabledMock,
  requirePollReadPermissionMock,
  getMyPollVoteForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePollsEnabledMock: vi.fn(),
  requirePollReadPermissionMock: vi.fn(),
  getMyPollVoteForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/polls/common', () => ({
  requirePollsEnabled: requirePollsEnabledMock,
  requirePollReadPermission: requirePollReadPermissionMock,
}));

vi.mock('@/lib/services/polls-service', () => ({
  getMyPollVoteForCommunity: getMyPollVoteForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/polls/[id]/my-vote/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

interface EnvelopeJson {
  data: {
    hasVoted: boolean;
    selectedOptions: string[];
  };
}

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

function ctx(id: number | string): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('GET /api/v1/polls/[id]/my-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePollsEnabledMock.mockReturnValue(undefined);
    requirePollReadPermissionMock.mockReturnValue(undefined);
  });

  it('returns the actor vote payload when the user has voted', async () => {
    getMyPollVoteForCommunityMock.mockResolvedValue({
      hasVoted: true,
      selectedOptions: ['opt-1', 'opt-2'],
    });

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/my-vote?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual({
      hasVoted: true,
      selectedOptions: ['opt-1', 'opt-2'],
    });
    expect(getMyPollVoteForCommunityMock).toHaveBeenCalledWith(42, 7, 'user-1');
    expect(requirePollsEnabledMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(requirePollReadPermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
  });

  it('returns the no-vote payload when the user has not voted', async () => {
    getMyPollVoteForCommunityMock.mockResolvedValue({
      hasVoted: false,
      selectedOptions: [],
    });

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/my-vote?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual({ hasVoted: false, selectedOptions: [] });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/my-vote?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(401);
    expect(getMyPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the actor is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/my-vote?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(requirePollsEnabledMock).not.toHaveBeenCalled();
    expect(getMyPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls are disabled for the community', async () => {
    requirePollsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Polls feature is disabled');
    });

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/my-vote?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(requirePollReadPermissionMock).not.toHaveBeenCalled();
    expect(getMyPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when poll read permission is denied', async () => {
    requirePollReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient poll read permission');
    });

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/my-vote?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(getMyPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when pollId is not a positive integer', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/abc/my-vote?communityId=42'),
      ctx('abc'),
    );

    expect(res.status).toBe(400);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getMyPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing from the query', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/my-vote'),
      ctx(7),
    );

    expect(res.status).toBe(400);
    expect(getMyPollVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/my-vote?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
      ctx(7),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getMyPollVoteForCommunityMock).not.toHaveBeenCalled();
  });
});
