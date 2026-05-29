/**
 * Unit tests — `GET /api/v1/elections` (A1 drain #137).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  requireElectionsEnabledMock,
  requirePermissionMock,
  listElectionsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireElectionsEnabledMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  listElectionsForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
}));

vi.mock('@/lib/elections/common', () => ({
  requireElectionsEnabled: requireElectionsEnabledMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/services/elections-service', () => ({
  listElectionsForCommunity: listElectionsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/elections/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_member' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  communityType: 'condo_718' as const,
};

function getReq(query = 'communityId=42&limit=5&statuses=draft,open'): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/elections?${query}`);
}

describe('GET /api/v1/elections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireElectionsEnabledMock.mockReturnValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    listElectionsForCommunityMock.mockResolvedValue([{ id: 1, title: 'Board' }]);
  });

  it('returns elections list in contracted envelope', async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([{ id: 1, title: 'Board' }]);
    expect(listElectionsForCommunityMock).toHaveBeenCalledWith(42, {
      limit: 5,
      statuses: ['draft', 'open'],
    });
  });

  it('returns 403 when elections.read denied', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Permission denied');
    });

    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it('returns 403 when elections feature disabled', async () => {
    requireElectionsEnabledMock.mockImplementation(() => {
      throw new ForbiddenError('Elections not enabled');
    });

    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });
});
