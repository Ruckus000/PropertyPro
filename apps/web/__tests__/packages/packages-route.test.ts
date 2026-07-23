import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePackageLoggingEnabledMock,
  requirePackagesReadPermissionMock,
  requirePackagesWritePermissionMock,
  requireStaffOperatorMock,
  isResidentRoleMock,
  requireActorUnitIdsMock,
  parseCommunityIdFromQueryMock,
  parseCommunityIdFromBodyMock,
  assertNotDemoGraceMock,
  paginatePackageLogMock,
  resolveUnitIdByLabelMock,
  createPackageForCommunityMock,
  createScopedClientMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePackageLoggingEnabledMock: vi.fn(),
  requirePackagesReadPermissionMock: vi.fn(),
  requirePackagesWritePermissionMock: vi.fn(),
  requireStaffOperatorMock: vi.fn(),
  isResidentRoleMock: vi.fn(),
  requireActorUnitIdsMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  paginatePackageLogMock: vi.fn(),
  resolveUnitIdByLabelMock: vi.fn(),
  createPackageForCommunityMock: vi.fn(),
  createScopedClientMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/logistics/common', () => ({
  isResidentRole: isResidentRoleMock,
  requireActorUnitIds: requireActorUnitIdsMock,
  requirePackageLoggingEnabled: requirePackageLoggingEnabledMock,
  requirePackagesReadPermission: requirePackagesReadPermissionMock,
  requirePackagesWritePermission: requirePackagesWritePermissionMock,
  requireStaffOperator: requireStaffOperatorMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  paginatePackageLog: paginatePackageLogMock,
  createPackageForCommunity: createPackageForCommunityMock,
}));

vi.mock('@/lib/services/units-lookup', () => ({
  resolveUnitIdByLabel: resolveUnitIdByLabelMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

import { GET, POST } from '../../src/app/api/v1/packages/route';

const COMMUNITY_ID = 42;
const ACTOR_USER_ID = 'user-staff-1';
const SCOPED_CLIENT = { __scoped: true };

const MEMBERSHIP = {
  userId: ACTOR_USER_ID,
  communityId: COMMUNITY_ID,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718',
};

const PACKAGE_ROW = {
  id: 99,
  communityId: COMMUNITY_ID,
  unitId: 17,
  recipientName: 'Jane Resident',
  carrier: 'UPS',
  trackingNumber: '1Z123',
  status: 'received',
  receivedByStaffId: ACTOR_USER_ID,
  pickedUpAt: null,
  pickedUpByName: null,
  notes: 'Fragile',
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-01T10:00:00Z'),
};

describe('/api/v1/packages route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR_USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePackageLoggingEnabledMock.mockResolvedValue(undefined);
    requirePackagesReadPermissionMock.mockReturnValue(undefined);
    requirePackagesWritePermissionMock.mockReturnValue(undefined);
    requireStaffOperatorMock.mockReturnValue(undefined);
    isResidentRoleMock.mockReturnValue(false);
    parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
    parseCommunityIdFromBodyMock.mockReturnValue(COMMUNITY_ID);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    createScopedClientMock.mockReturnValue(SCOPED_CLIENT);
    resolveUnitIdByLabelMock.mockResolvedValue({ kind: 'resolved', unitId: 17 });
    createPackageForCommunityMock.mockResolvedValue(PACKAGE_ROW);
  });

  it('GET returns paginated shape without cursor', async () => {
    paginatePackageLogMock.mockResolvedValue({
      data: [PACKAGE_ROW],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}`),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        data: [
          {
            ...PACKAGE_ROW,
            createdAt: PACKAGE_ROW.createdAt.toISOString(),
            updatedAt: PACKAGE_ROW.updatedAt.toISOString(),
          },
        ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      },
    });
    expect(paginatePackageLogMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      cursor: undefined,
      pageSize: undefined,
      status: undefined,
      unitId: undefined,
      allowedUnitIds: undefined,
    });
  });

  it('GET forwards cursor paging and status filter', async () => {
    paginatePackageLogMock.mockResolvedValue({
      data: [PACKAGE_ROW],
      pagination: { nextCursor: 'next-cursor', hasMore: true, pageSize: 25 },
    });

    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25&status=received`),
    );

    expect(res.status).toBe(200);
    expect(paginatePackageLogMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      cursor: 'abc',
      pageSize: 25,
      status: 'received',
      unitId: undefined,
      allowedUnitIds: undefined,
    });
  });

  it('GET treats empty cursor/pageSize as undefined', async () => {
    paginatePackageLogMock.mockResolvedValue({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
    );

    expect(res.status).toBe(200);
    expect(paginatePackageLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined, pageSize: undefined }),
    );
  });

  it('GET returns 403 resident unit guard for out-of-scope unit', async () => {
    isResidentRoleMock.mockReturnValue(true);
    requireActorUnitIdsMock.mockResolvedValue([10, 11]);

    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}&unitId=42`),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'FORBIDDEN', message: 'You can only view packages for your own unit' },
    });
    expect(paginatePackageLogMock).not.toHaveBeenCalled();
  });

  it('GET returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}`),
    );
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for membership gate', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}`),
    );
    expect(res.status).toBe(403);
    expect(requirePackageLoggingEnabledMock).not.toHaveBeenCalled();
  });

  it('GET returns 403 for package logging gate', async () => {
    requirePackageLoggingEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Package logging disabled'),
    );
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}`),
    );
    expect(res.status).toBe(403);
    expect(requirePackagesReadPermissionMock).not.toHaveBeenCalled();
  });

  it('GET returns 403 for read permission gate', async () => {
    requirePackagesReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Permission denied');
    });
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}`),
    );
    expect(res.status).toBe(403);
    expect(paginatePackageLogMock).not.toHaveBeenCalled();
  });

  it('GET returns 400 for validation errors', async () => {
    const resMissing = await GET(new NextRequest('http://localhost:3000/api/v1/packages'));
    expect(resMissing.status).toBe(400);

    const resBadStatus = await GET(
      new NextRequest(`http://localhost:3000/api/v1/packages?communityId=${COMMUNITY_ID}&status=bad`),
    );
    expect(resBadStatus.status).toBe(400);
  });

  it('POST creates package and forwards null x-request-id when absent', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          unitNumber: 'A-101',
          recipientName: 'Jane Resident',
          carrier: 'UPS',
          trackingNumber: null,
          notes: null,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(createPackageForCommunityMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      ACTOR_USER_ID,
      {
        unitId: 17,
        recipientName: 'Jane Resident',
        carrier: 'UPS',
        trackingNumber: null,
        notes: null,
      },
      null,
    );
  });

  it('POST returns 403 for demo grace gate', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          unitNumber: 'A-101',
          recipientName: 'Jane Resident',
          carrier: 'UPS',
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('POST returns 403 for membership gate', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          unitNumber: 'A-101',
          recipientName: 'Jane Resident',
          carrier: 'UPS',
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(requirePackageLoggingEnabledMock).not.toHaveBeenCalled();
  });

  it('POST returns 403 for package logging gate', async () => {
    requirePackageLoggingEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Package logging disabled'),
    );
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          unitNumber: 'A-101',
          recipientName: 'Jane Resident',
          carrier: 'UPS',
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(requirePackagesWritePermissionMock).not.toHaveBeenCalled();
  });

  it('POST returns 403 for write permission gate', async () => {
    requirePackagesWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Permission denied');
    });
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          unitNumber: 'A-101',
          recipientName: 'Jane Resident',
          carrier: 'UPS',
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(requireStaffOperatorMock).not.toHaveBeenCalled();
  });

  it('POST returns 403 for staff-operator gate', async () => {
    requireStaffOperatorMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Staff operator required');
    });
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          unitNumber: 'A-101',
          recipientName: 'Jane Resident',
          carrier: 'UPS',
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(createPackageForCommunityMock).not.toHaveBeenCalled();
  });

  it('POST returns 400 for validation errors', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          unitNumber: 'A-101',
          recipientName: '',
          carrier: 'UPS',
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
