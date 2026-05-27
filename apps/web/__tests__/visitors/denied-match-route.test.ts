/**
 * Route unit tests — `GET /api/v1/visitors/denied/match`.
 *
 * Added alongside Plan A1 drain #85. Covers the contracted runRoute envelope:
 * happy paths (all four filter combinations), 401 unauth,
 * 400 missing/non-numeric communityId, 403 non-member /
 * visitor-logging-disabled / visitors-read permission denied /
 * staff-operator gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermissionMock,
  requireStaffOperatorMock,
  matchDeniedVisitorsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsReadPermissionMock: vi.fn(),
  requireStaffOperatorMock: vi.fn(),
  matchDeniedVisitorsMock: vi.fn(),
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
  requireVisitorLoggingEnabled: requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermission: requireVisitorsReadPermissionMock,
  requireStaffOperator: requireStaffOperatorMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  matchDeniedVisitors: matchDeniedVisitorsMock,
}));

import { GET } from '../../src/app/api/v1/visitors/denied/match/route';

const STAFF_MEMBERSHIP = {
  userId: 'user-staff-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const MATCH_ROWS = [
  { id: 1, fullName: 'John Doe', vehiclePlate: 'ABC123' },
];

function buildReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/visitors/denied/match${qs}`, {
    method: 'GET',
  });
}

describe('GET /api/v1/visitors/denied/match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-staff-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
    requireVisitorsReadPermissionMock.mockReturnValue(undefined);
    requireStaffOperatorMock.mockReturnValue(undefined);
    matchDeniedVisitorsMock.mockResolvedValue(MATCH_ROWS);
  });

  it('matches with both name and plate provided (happy path)', async () => {
    const res = await GET(
      buildReq('?communityId=42&name=John%20Doe&plate=ABC123'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown };
    expect(json.data).toEqual(MATCH_ROWS);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-staff-1');
    expect(requireVisitorLoggingEnabledMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(requireVisitorsReadPermissionMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(requireStaffOperatorMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(matchDeniedVisitorsMock).toHaveBeenCalledWith(42, 'John Doe', 'ABC123');
  });

  it('matches with only name provided (plate → null)', async () => {
    const res = await GET(buildReq('?communityId=42&name=name'));

    expect(res.status).toBe(200);
    expect(matchDeniedVisitorsMock).toHaveBeenCalledWith(42, 'name', null);
  });

  it('matches with only plate provided (name → null)', async () => {
    const res = await GET(buildReq('?communityId=42&plate=plate'));

    expect(res.status).toBe(200);
    expect(matchDeniedVisitorsMock).toHaveBeenCalledWith(42, null, 'plate');
  });

  it('matches with neither name nor plate (both → null)', async () => {
    const res = await GET(buildReq('?communityId=42'));

    expect(res.status).toBe(200);
    expect(matchDeniedVisitorsMock).toHaveBeenCalledWith(42, null, null);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(buildReq('?communityId=42'));

    expect(res.status).toBe(401);
    expect(matchDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await GET(buildReq(''));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(matchDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(buildReq('?communityId=abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(matchDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(buildReq('?communityId=42'));

    expect(res.status).toBe(403);
    expect(requireVisitorLoggingEnabledMock).not.toHaveBeenCalled();
    expect(matchDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitor logging is disabled for the community', async () => {
    requireVisitorLoggingEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Visitor logging not enabled'),
    );

    const res = await GET(buildReq('?communityId=42'));

    expect(res.status).toBe(403);
    expect(requireVisitorsReadPermissionMock).not.toHaveBeenCalled();
    expect(requireStaffOperatorMock).not.toHaveBeenCalled();
    expect(matchDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitors.read permission is denied', async () => {
    requireVisitorsReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await GET(buildReq('?communityId=42'));

    expect(res.status).toBe(403);
    expect(requireStaffOperatorMock).not.toHaveBeenCalled();
    expect(matchDeniedVisitorsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a staff operator', async () => {
    requireStaffOperatorMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Staff operator required');
    });

    const res = await GET(buildReq('?communityId=42'));

    expect(res.status).toBe(403);
    expect(matchDeniedVisitorsMock).not.toHaveBeenCalled();
  });
});
