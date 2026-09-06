/**
 * Route unit tests — `POST /api/v1/elections/[id]/vote`.
 *
 * Added alongside Plan A1 drain #50. Covers the contracted runRoute envelope:
 * happy ballot / abstention / proxy / unit / minimal (?? null coercion)
 * variants, 401 unauth, 400 invalid params.id / missing-communityId /
 * selectedCandidateIds > 25 / isAbstention non-boolean, 403 demo-grace,
 * 403 non-member, 403 elections-disabled, 403 permission, and x-request-id
 * null forwarding.
 *
 * Note: this is the RESIDENT-facing vote endpoint and intentionally has no
 * admin-role gate (cf. drain #46 certify, which gates on
 * `requireElectionsAdminRole`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireElectionsEnabledMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  castElectionVoteForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  castElectionVoteForCommunityMock: vi.fn(),
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

vi.mock('@/lib/elections/common', () => ({
  requireElectionsEnabled: requireElectionsEnabledMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/elections-service', () => ({
  castElectionVoteForCommunity: castElectionVoteForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/elections/[id]/vote/route';

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
  electionId: 7,
  castAt: new Date('2026-01-01T00:00:00Z'),
};

function jsonPost(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/elections/${id}/vote`,
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

describe('POST /api/v1/elections/[id]/vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-resident-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    castElectionVoteForCommunityMock.mockResolvedValue(VOTE_RESULT);
  });

  it('casts a ballot vote with selectedCandidateIds (happy path)', async () => {
    const res = await POST(
      jsonPost(
        7,
        { communityId: 42, selectedCandidateIds: [1, 2, 3] },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; electionId: number } };
    expect(json.data.id).toBe(99);
    expect(json.data.electionId).toBe(7);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-resident-1');
    expect(requireElectionsEnabledMock).toHaveBeenCalledWith(RESIDENT_MEMBERSHIP);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      RESIDENT_MEMBERSHIP,
      'elections',
      'write',
    );
    expect(castElectionVoteForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident-1',
      {
        selectedCandidateIds: [1, 2, 3],
        isAbstention: undefined,
        proxyId: null,
        unitId: null,
      },
      'req-abc',
    );
  });

  it('casts an abstention vote (isAbstention=true)', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, isAbstention: true }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(castElectionVoteForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident-1',
      {
        selectedCandidateIds: undefined,
        isAbstention: true,
        proxyId: null,
        unitId: null,
      },
      null,
    );
  });

  it('casts a proxy vote (proxyId provided)', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, proxyId: 5, selectedCandidateIds: [1] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(castElectionVoteForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident-1',
      {
        selectedCandidateIds: [1],
        isAbstention: undefined,
        proxyId: 5,
        unitId: null,
      },
      null,
    );
  });

  it('casts a unit-scoped vote (unitId provided)', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, unitId: 10, selectedCandidateIds: [2] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(castElectionVoteForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident-1',
      {
        selectedCandidateIds: [2],
        isAbstention: undefined,
        proxyId: null,
        unitId: 10,
      },
      null,
    );
  });

  it('coerces all four optional fields to canonical service shape when omitted (?? null on proxyId/unitId)', async () => {
    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(200);
    expect(castElectionVoteForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-resident-1',
      {
        selectedCandidateIds: undefined,
        isAbstention: undefined,
        proxyId: null,
        unitId: null,
      },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(jsonPost('abc', { communityId: 42 }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(jsonPost('0', { communityId: 42 }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await POST(jsonPost(7, {}), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when selectedCandidateIds exceeds 25 entries', async () => {
    const tooMany = Array.from({ length: 26 }, (_, i) => i + 1);
    const res = await POST(
      jsonPost(7, { communityId: 42, selectedCandidateIds: tooMany }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when isAbstention is not a boolean', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, isAbstention: 'yes' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireElectionsEnabledMock).not.toHaveBeenCalled();
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections are disabled for the community', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Elections not enabled');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost(7, { communityId: 42 }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(castElectionVoteForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await POST(
      jsonPost(7, { communityId: 42, selectedCandidateIds: [1] }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = castElectionVoteForCommunityMock.mock.calls[0]!;
    expect(call[4]).toBeNull();
  });
});
