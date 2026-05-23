/**
 * Route unit test — `GET /api/v1/polls/[id]/results`.
 *
 * Added alongside Plan A1 drain #14. Direct clone of the drain #11
 * (polls/[id]/my-vote) test scaffold; the multi-gate polls auth chain
 * (auth → community resolve → membership → polls-enabled → poll-read-
 * permission), the runner's params+query validation envelope, and the
 * service contract differ only in the terminal service call:
 * `getPollResultsForCommunity(communityId, pollId)` (NO actor userId).
 *
 * Response shape is intentionally loose (drain #8 / drain #14 contract
 * uses `z.unknown()`); these tests assert structural shape via
 * `toEqual` on the mocked service return value.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError, NotFoundError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePollsEnabledMock,
  requirePollReadPermissionMock,
  getPollResultsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePollsEnabledMock: vi.fn(),
  requirePollReadPermissionMock: vi.fn(),
  getPollResultsForCommunityMock: vi.fn(),
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
  getPollResultsForCommunity: getPollResultsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/polls/[id]/results/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const FAKE_RESULTS = {
  poll: {
    id: 7,
    communityId: 42,
    title: 'Pool renovation',
    description: null,
    pollType: 'single_choice',
    options: ['yes', 'no'],
    endsAt: null,
    createdByUserId: 'user-1',
    isActive: true,
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
  },
  totalVotes: 3,
  options: [
    { option: 'yes', votes: 2, percentage: 66.67 },
    { option: 'no', votes: 1, percentage: 33.33 },
  ],
};

interface EnvelopeJson {
  data: unknown;
}

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

function ctx(id: number | string): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('GET /api/v1/polls/[id]/results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePollsEnabledMock.mockReturnValue(undefined);
    requirePollReadPermissionMock.mockReturnValue(undefined);
  });

  it('returns the aggregate poll results payload', async () => {
    getPollResultsForCommunityMock.mockResolvedValue(FAKE_RESULTS);

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/results?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual(FAKE_RESULTS);
    expect(getPollResultsForCommunityMock).toHaveBeenCalledWith(42, 7);
    expect(requirePollsEnabledMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(requirePollReadPermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/results?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(401);
    expect(getPollResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the actor is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/results?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(requirePollsEnabledMock).not.toHaveBeenCalled();
    expect(getPollResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when polls are disabled for the community', async () => {
    requirePollsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Polls feature is disabled');
    });

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/results?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(requirePollReadPermissionMock).not.toHaveBeenCalled();
    expect(getPollResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when poll read permission is denied', async () => {
    requirePollReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient poll read permission');
    });

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/results?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(getPollResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the service reports the poll is missing', async () => {
    getPollResultsForCommunityMock.mockRejectedValueOnce(new NotFoundError('Poll not found'));

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/results?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 when pollId is not a positive integer', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/abc/results?communityId=42'),
      ctx('abc'),
    );

    expect(res.status).toBe(400);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getPollResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing from the query', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/results'),
      ctx(7),
    );

    expect(res.status).toBe(400);
    expect(getPollResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/polls/7/results?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
      ctx(7),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getPollResultsForCommunityMock).not.toHaveBeenCalled();
  });
});
