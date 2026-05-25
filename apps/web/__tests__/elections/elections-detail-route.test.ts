/**
 * Route unit tests — `GET /api/v1/elections/[id]`.
 *
 * Added alongside Plan A1 bundle drain #32. Covers the contracted
 * runRoute envelope: happy path, 401 unauth, 400 missing/invalid query +
 * 400 invalid [id], 404 x-community-id header mismatch (drain #26
 * adopted-review lesson), 403 non-member, 403 elections-disabled,
 * 403 elections.read permission denied.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireElectionsEnabledMock,
  requirePermissionMock,
  getElectionDetailForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getElectionDetailForCommunityMock: vi.fn(),
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
  getElectionDetailForCommunity: getElectionDetailForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/elections/[id]/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_member' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  communityType: 'condo_718' as const,
};

const ELECTION = { id: 7, title: 'Board election', openAt: new Date('2026-01-01T00:00:00Z') };

function req(qs = '?communityId=42', id = '7', headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/elections/${id}${qs}`, {
    headers: headers ?? {},
  });
}
function ctx(id = '7') {
  return { params: Promise.resolve({ id }) };
}

interface DetailJson {
  data: { id: number; title: string };
}

describe('GET /api/v1/elections/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    getElectionDetailForCommunityMock.mockResolvedValue(ELECTION);
  });

  it('returns wrapped election detail for a permitted member', async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const json = (await res.json()) as DetailJson;
    expect(json.data.id).toBe(7);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireElectionsEnabledMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'elections', 'read');
    expect(getElectionDetailForCommunityMock).toHaveBeenCalledWith(42, 7);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(getElectionDetailForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(req(''), ctx());
    expect(res.status).toBe(400);
    expect(getElectionDetailForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const res = await GET(req('?communityId=abc'), ctx());
    expect(res.status).toBe(400);
    expect(getElectionDetailForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 when [id] is non-numeric', async () => {
    const res = await GET(req('?communityId=42', 'abc'), ctx('abc'));
    expect(res.status).toBe(400);
    expect(getElectionDetailForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(req('?communityId=42', '7', { 'x-community-id': '99' }), ctx());
    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a member of the community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(getElectionDetailForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections are disabled for the community', async () => {
    requireElectionsEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Elections not enabled');
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(getElectionDetailForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when elections.read permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Permission denied');
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(getElectionDetailForCommunityMock).not.toHaveBeenCalled();
  });
});
