/**
 * Route unit tests — `GET /api/v1/emergency-broadcasts/[id]`.
 *
 * Added alongside Plan A1 drain #115.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  getBroadcastWithReportMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getBroadcastWithReportMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/services/emergency-broadcast-service', () => ({
  getBroadcastWithReport: getBroadcastWithReportMock,
}));

import { GET } from '../../src/app/api/v1/emergency-broadcasts/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const REPORT = {
  id: 5,
  communityId: 42,
  title: 'Storm alert',
  body: 'Shelter in place',
  smsBody: null,
  severity: 'emergency',
  templateKey: null,
  targetAudience: 'all',
  channels: ['sms', 'email'],
  recipientCount: 10,
  sentCount: 8,
  deliveredCount: 7,
  failedCount: 1,
  initiatedBy: 'user-admin-1',
  initiatedAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
  canceledAt: null,
  recipients: [],
};

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/emergency-broadcasts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    getBroadcastWithReportMock.mockResolvedValue(REPORT);
  });

  it('returns broadcast report wrapped in { data }', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/emergency-broadcasts/5?communityId=42',
    );
    const res = await GET(req, routeCtx('5'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: REPORT });
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalled();
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requirePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
      'emergency_broadcasts',
      'read',
    );
    expect(getBroadcastWithReportMock).toHaveBeenCalledWith(5, 42);
  });

  it('returns 404 when broadcast is missing', async () => {
    getBroadcastWithReportMock.mockResolvedValueOnce(null);
    const req = new NextRequest(
      'http://localhost:3000/api/v1/emergency-broadcasts/99?communityId=42',
    );

    const res = await GET(req, routeCtx('99'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toBe('Broadcast not found');
  });

  it('returns 404 when x-community-id header mismatches query communityId', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/emergency-broadcasts/5?communityId=42',
      { headers: { 'x-community-id': '99' } },
    );

    const res = await GET(req, routeCtx('5'));
    expect(res.status).toBe(404);
    expect(getBroadcastWithReportMock).not.toHaveBeenCalled();
  });

  it('returns 401 for unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const req = new NextRequest(
      'http://localhost:3000/api/v1/emergency-broadcasts/5?communityId=42',
    );

    const res = await GET(req, routeCtx('5'));
    expect(res.status).toBe(401);
    expect(getBroadcastWithReportMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const req = new NextRequest(
      'http://localhost:3000/api/v1/emergency-broadcasts/5?communityId=42',
    );
    const res = await GET(req, routeCtx('5'));

    expect(res.status).toBe(403);
    expect(getBroadcastWithReportMock).not.toHaveBeenCalled();
  });

  it('returns 403 when emergency_broadcasts read permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Permission denied');
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/emergency-broadcasts/5?communityId=42',
    );
    const res = await GET(req, routeCtx('5'));

    expect(res.status).toBe(403);
    expect(getBroadcastWithReportMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId query is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts/5');
    const res = await GET(req, routeCtx('5'));

    expect(res.status).toBe(400);
    expect(getBroadcastWithReportMock).not.toHaveBeenCalled();
  });

  it('returns 400 for non-numeric params.id', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/emergency-broadcasts/abc?communityId=42',
    );
    const res = await GET(req, routeCtx('abc'));

    expect(res.status).toBe(400);
    expect(getBroadcastWithReportMock).not.toHaveBeenCalled();
  });

  it('returns 400 for zero params.id', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/emergency-broadcasts/0?communityId=42',
    );
    const res = await GET(req, routeCtx('0'));

    expect(res.status).toBe(400);
    expect(getBroadcastWithReportMock).not.toHaveBeenCalled();
  });
});
