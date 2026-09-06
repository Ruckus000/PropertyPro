/**
 * Route unit test — `GET /api/v1/elections/[id]/my-vote`.
 *
 * Added alongside Plan A1 drain #30 (Move 2 bundle). Asserts the 5-gate
 * auth chain (auth → membership → elections-enabled → elections.read
 * permission) plus the runner's canonical 400 envelope on missing/invalid
 * params or query.
 *
 * Test invokes `GET` with the Next.js App Router context shape
 * `{ params: Promise<...> }` — `runRoute` reads params from that handle.
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
  getMyElectionVoteReceiptForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getMyElectionVoteReceiptForCommunityMock: vi.fn(),
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
  getMyElectionVoteReceiptForCommunity: getMyElectionVoteReceiptForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/elections/[id]/my-vote/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const RECEIPT = {
  electionId: 7,
  castAt: new Date('2026-04-01T12:00:00Z'),
  ballotHash: 'abc123',
};

interface EnvelopeJson {
  data: unknown;
}

interface ErrorJson {
  error: { code: string; message: string };
}

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;
function buildReq(url: string, init?: NextRequestInit): NextRequest {
  return new NextRequest(url, init);
}

function buildCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/elections/[id]/my-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireElectionsEnabledMock.mockImplementation(() => undefined);
    requirePermissionMock.mockImplementation(() => undefined);
    getMyElectionVoteReceiptForCommunityMock.mockResolvedValue(RECEIPT);
  });

  it('returns the vote receipt — happy path', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/my-vote?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toMatchObject({ electionId: 7, ballotHash: 'abc123' });
    expect(getMyElectionVoteReceiptForCommunityMock).toHaveBeenCalledWith(42, 7, 'user-1');
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'elections', 'read');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/my-vote?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(getMyElectionVoteReceiptForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireCommunityMembership throws', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/my-vote?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(getMyElectionVoteReceiptForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireElectionsEnabled throws', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('elections not enabled');
    });

    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/my-vote?communityId=42'),
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
      buildReq('http://localhost/api/v1/elections/7/my-vote?communityId=42'),
      buildCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(getMyElectionVoteReceiptForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when path id is non-numeric', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/elections/abc/my-vote?communityId=42'),
      buildCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/my-vote'),
      buildCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/my-vote?communityId=abc'),
      buildCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when x-community-id header disagrees with query communityId', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/elections/7/my-vote?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
      buildCtx('7'),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getMyElectionVoteReceiptForCommunityMock).not.toHaveBeenCalled();
  });
});
