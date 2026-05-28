/**
 * Route unit tests — `GET /api/v1/visitors/my`.
 *
 * Plan A1 drain #105. Covers filter branches, passCode stripping, and auth gates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermissionMock,
  requireActorUnitIdsMock,
  createScopedClientMock,
  scopedClient,
  listMyVisitorsForCommunityMock,
  listVisitorsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsReadPermissionMock: vi.fn(),
  requireActorUnitIdsMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  scopedClient: { __scoped: true },
  listMyVisitorsForCommunityMock: vi.fn(),
  listVisitorsForCommunityMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/logistics/common', () => ({
  isResidentRole: (role: string) => role === 'owner' || role === 'tenant',
  requireActorUnitIds: requireActorUnitIdsMock,
  requireVisitorLoggingEnabled: requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermission: requireVisitorsReadPermissionMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  listMyVisitorsForCommunity: listMyVisitorsForCommunityMock,
  listVisitorsForCommunity: listVisitorsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/visitors/my/route';

const COMMUNITY_ID = 42;
const ACTOR_USER_ID = 'resident-1';
const ALLOWED_UNIT_IDS = [10, 11];

/** Fields from `VisitorLogRow` in package-visitor-service.ts */
const VISITOR_ROW = {
  id: 1,
  communityId: COMMUNITY_ID,
  visitorName: 'Jane Guest',
  purpose: 'Delivery',
  hostUnitId: 10,
  hostUnitLabel: '10A',
  hostUserId: ACTOR_USER_ID,
  expectedArrival: new Date('2026-06-01T12:00:00Z'),
  checkedInAt: new Date('2026-06-01T12:05:00Z'),
  checkedOutAt: null,
  passCode: 'SECRET123',
  staffUserId: null,
  notes: null,
  guestType: 'guest',
  validFrom: null,
  validUntil: null,
  recurrenceRule: null,
  expectedDurationMinutes: null,
  vehicleMake: null,
  vehicleModel: null,
  vehicleColor: null,
  vehiclePlate: null,
  revokedByUserId: null,
  revokedAt: null,
  createdAt: new Date('2026-06-01T11:00:00Z'),
  updatedAt: new Date('2026-06-01T12:05:00Z'),
};

const RESIDENT_MEMBERSHIP = {
  userId: ACTOR_USER_ID,
  communityId: COMMUNITY_ID,
  role: 'owner',
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718',
};

function buildGetReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/visitors/my${qs}`);
}

describe('GET /api/v1/visitors/my', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(ACTOR_USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
    requireVisitorsReadPermissionMock.mockReturnValue(undefined);
    createScopedClientMock.mockReturnValue(scopedClient);
    requireActorUnitIdsMock.mockResolvedValue(ALLOWED_UNIT_IDS);
    listMyVisitorsForCommunityMock.mockResolvedValue([VISITOR_ROW]);
    listVisitorsForCommunityMock.mockResolvedValue([VISITOR_ROW]);
  });

  it('returns default list without filter', async () => {
    const res = await GET(buildGetReq(`?communityId=${COMMUNITY_ID}`));

    expect(res.status).toBe(200);
    expect(createScopedClientMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(requireActorUnitIdsMock).toHaveBeenCalledWith(scopedClient, ACTOR_USER_ID);
    expect(listMyVisitorsForCommunityMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      ACTOR_USER_ID,
      ALLOWED_UNIT_IDS,
    );
    expect(listVisitorsForCommunityMock).not.toHaveBeenCalled();

    const json = (await res.json()) as { data: Record<string, unknown>[] };
    expect(json.data[0]).not.toHaveProperty('passCode');
    expect(json.data[0]?.visitorName).toBe('Jane Guest');
  });

  it('uses listVisitorsForCommunity for active filter', async () => {
    await GET(buildGetReq(`?communityId=${COMMUNITY_ID}&filter=active`));

    expect(listVisitorsForCommunityMock).toHaveBeenCalledWith(COMMUNITY_ID, {
      allowedUnitIds: ALLOWED_UNIT_IDS,
      hostUserId: ACTOR_USER_ID,
      status: 'checked_in',
    });
    expect(listMyVisitorsForCommunityMock).not.toHaveBeenCalled();
  });

  it('uses listVisitorsForCommunity for upcoming filter', async () => {
    await GET(buildGetReq(`?communityId=${COMMUNITY_ID}&filter=upcoming`));

    expect(listVisitorsForCommunityMock).toHaveBeenCalledWith(COMMUNITY_ID, {
      allowedUnitIds: ALLOWED_UNIT_IDS,
      hostUserId: ACTOR_USER_ID,
      status: 'expected',
    });
  });

  it('filters past visitors by derived status', async () => {
    const checkedOutRow = {
      ...VISITOR_ROW,
      checkedInAt: new Date('2026-06-01T12:00:00Z'),
      checkedOutAt: new Date('2026-06-01T14:00:00Z'),
    };
    const activeRow = { ...VISITOR_ROW, id: 2, checkedOutAt: null };
    listVisitorsForCommunityMock.mockResolvedValueOnce([checkedOutRow, activeRow]);

    const res = await GET(buildGetReq(`?communityId=${COMMUNITY_ID}&filter=past`));

    expect(listVisitorsForCommunityMock).toHaveBeenCalledWith(COMMUNITY_ID, {
      allowedUnitIds: ALLOWED_UNIT_IDS,
      hostUserId: ACTOR_USER_ID,
      onlyActive: false,
    });
    const json = (await res.json()) as { data: { id: number }[] };
    expect(json.data).toHaveLength(1);
    expect(json.data[0]?.id).toBe(1);
  });

  it('falls back to default list for unknown filter', async () => {
    await GET(buildGetReq(`?communityId=${COMMUNITY_ID}&filter=unknown`));

    expect(listMyVisitorsForCommunityMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      ACTOR_USER_ID,
      ALLOWED_UNIT_IDS,
    );
    expect(listVisitorsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(buildGetReq(`?communityId=${COMMUNITY_ID}`));
    expect(res.status).toBe(401);
    expect(listMyVisitorsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a resident', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      ...RESIDENT_MEMBERSHIP,
      role: 'cam',
    });

    const res = await GET(buildGetReq(`?communityId=${COMMUNITY_ID}`));
    expect(res.status).toBe(403);
    expect(listMyVisitorsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when visitor logging is disabled', async () => {
    requireVisitorLoggingEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Visitor logging not enabled'),
    );

    const res = await GET(buildGetReq(`?communityId=${COMMUNITY_ID}`));
    expect(res.status).toBe(403);
    expect(listMyVisitorsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with query', async () => {
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/visitors/my?communityId=${COMMUNITY_ID}`, {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(listMyVisitorsForCommunityMock).not.toHaveBeenCalled();
  });
});
