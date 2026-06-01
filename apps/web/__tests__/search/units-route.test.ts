/**
 * Unit tests for GET /api/v1/search/units (A1 drain #161).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireStaffOperatorMock,
  searchUnitsByLabelMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireStaffOperatorMock: vi.fn(),
  searchUnitsByLabelMock: vi.fn(),
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

vi.mock('@/lib/logistics/common', () => ({
  requireStaffOperator: requireStaffOperatorMock,
}));

vi.mock('@/lib/services/units-lookup', () => ({
  searchUnitsByLabel: searchUnitsByLabelMock,
}));

import { GET } from '../../src/app/api/v1/search/units/route';

const STAFF_MEMBERSHIP = { role: 'site_manager', communityId: 7 };

describe('GET /api/v1/search/units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(7);
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireStaffOperatorMock.mockReturnValue(undefined);
    searchUnitsByLabelMock.mockResolvedValue([
      { id: 101, unitNumber: 'PH-A', building: 'Tower', floor: 12 },
    ]);
  });

  it('returns mapped unit search results in the canonical envelope', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/v1/search/units?communityId=7&q=ph&limit=10'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      data: {
        results: [{ id: 101, label: 'PH-A', building: 'Tower', floor: 12 }],
      },
    });
    expect(searchUnitsByLabelMock).toHaveBeenCalledWith(7, 'ph', 10);
    expect(requireStaffOperatorMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
  });

  it('returns an empty results array when q is blank without calling the service', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/v1/search/units?communityId=7&q=%20'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { results: [] } });
    expect(searchUnitsByLabelMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated and does not search', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost/api/v1/search/units?communityId=7&q=a'),
    );
    expect(res.status).toBe(401);
    expect(searchUnitsByLabelMock).not.toHaveBeenCalled();
    expect(requireStaffOperatorMock).not.toHaveBeenCalled();
  });

  it('returns 403 when staff operator gate fails and does not search', async () => {
    requireStaffOperatorMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Forbidden');
    });

    const res = await GET(
      new NextRequest('http://localhost/api/v1/search/units?communityId=7&q=a'),
    );
    expect(res.status).toBe(403);
    expect(searchUnitsByLabelMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(new NextRequest('http://localhost/api/v1/search/units?q=a'));
    expect(res.status).toBe(400);
    expect(searchUnitsByLabelMock).not.toHaveBeenCalled();
  });
});
