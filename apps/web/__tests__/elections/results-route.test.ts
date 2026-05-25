/**
 * Route unit test — `GET /api/v1/elections/[id]/results`.
 *
 * Added alongside Plan A1 drain #31 (Move 2 bundle). Mirrors the my-vote
 * sibling test: same 5-gate auth chain, same params + query plumbing. The
 * service call signature differs — `getElectionResultsForCommunity(communityId,
 * electionId)` takes no actor user.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireElectionsEnabledMock,
  requirePermissionMock,
  getElectionResultsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getElectionResultsForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/elections/common', () => ({
  requireElectionsEnabled: requireElectionsEnabledMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/services/elections-service', () => ({
  getElectionResultsForCommunity: getElectionResultsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/elections/[id]/results/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const RESULTS = {
  electionId: 7,
  totalVotes: 42,
  certifiedAt: new Date('2026-04-15T00:00:00Z'),
};

interface EnvelopeJson {
  data: unknown;
}

interface ErrorJson {
  error: { code: string; message: string };
}

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

function buildCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/elections/[id]/results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireElectionsEnabledMock.mockImplementation(() => undefined);
    requirePermissionMock.mockImplementation(() => undefined);
    getElectionResultsForCommunityMock.mockResolvedValue(RESULTS);
  });

  it('returns election results — happy path', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/results?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toMatchObject({ electionId: 7, totalVotes: 42 });
    expect(getElectionResultsForCommunityMock).toHaveBeenCalledWith(42, 7);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'elections', 'read');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/results?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(getElectionResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireCommunityMembership throws', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/results?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(getElectionResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireElectionsEnabled throws', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('elections not enabled');
    });

    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/results?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requirePermission throws', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('insufficient permission');
    });

    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/results?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(getElectionResultsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when path id is non-numeric', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/elections/abc/results?communityId=42'),
      buildCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/results'),
      buildCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
