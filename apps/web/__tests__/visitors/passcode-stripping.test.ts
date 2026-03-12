/**
 * Tests that the visitors GET endpoint strips `passCode` from responses
 * when the caller has a resident role, while preserving it for staff roles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  listVisitorsForCommunityMock,
  requireActorUnitIdsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  listVisitorsForCommunityMock: vi.fn(),
  requireActorUnitIdsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/package-visitor-service', () => ({
  createVisitorForCommunity: vi.fn(),
  listVisitorsForCommunity: listVisitorsForCommunityMock,
}));
vi.mock('@/lib/logistics/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logistics/common')>();
  return {
    ...actual,
    requireActorUnitIds: requireActorUnitIdsMock,
    requireVisitorLoggingEnabled: vi.fn(),
    requireVisitorsReadPermission: vi.fn(),
  };
});
vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: vi.fn(() => 1),
  parseCommunityIdFromBody: vi.fn((_req: unknown, id: number) => id),
}));

import { GET } from '../../src/app/api/v1/visitors/route';

const MOCK_VISITORS = [
  { id: 1, visitorName: 'Alice', purpose: 'Dinner', passCode: 'SECRET-ABC-123', hostUnitId: 10 },
  { id: 2, visitorName: 'Bob', purpose: 'Delivery', passCode: 'SECRET-XYZ-789', hostUnitId: 10 },
];

function makeMembership(role: string) {
  return { role, communityId: 1, userId: 'user-1', communityType: 'apartment' };
}

describe('visitors GET — passCode field stripping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    listVisitorsForCommunityMock.mockResolvedValue(MOCK_VISITORS);
    requireActorUnitIdsMock.mockResolvedValue([10]);
  });

  it('strips passCode from response for tenant role', async () => {
    requireCommunityMembershipMock.mockResolvedValue(makeMembership('tenant'));

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    for (const visitor of json.data) {
      expect(visitor).not.toHaveProperty('passCode');
      expect(visitor).toHaveProperty('visitorName');
      expect(visitor).toHaveProperty('purpose');
    }
  });

  it('strips passCode from response for owner role', async () => {
    requireCommunityMembershipMock.mockResolvedValue(makeMembership('owner'));

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    for (const visitor of json.data) {
      expect(visitor).not.toHaveProperty('passCode');
    }
  });

  it('preserves passCode for board_member role (not a resident role)', async () => {
    requireCommunityMembershipMock.mockResolvedValue(makeMembership('board_member'));

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    // board_member is not in RESIDENT_ROLES (owner, tenant), so passCode is preserved
    expect(json.data[0].passCode).toBe('SECRET-ABC-123');
  });

  it('preserves passCode in response for cam (staff) role', async () => {
    requireCommunityMembershipMock.mockResolvedValue(makeMembership('cam'));

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].passCode).toBe('SECRET-ABC-123');
    expect(json.data[1].passCode).toBe('SECRET-XYZ-789');
  });

  it('preserves passCode in response for site_manager role', async () => {
    requireCommunityMembershipMock.mockResolvedValue(makeMembership('site_manager'));

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0].passCode).toBe('SECRET-ABC-123');
  });

  it('preserves passCode in response for property_manager_admin role', async () => {
    requireCommunityMembershipMock.mockResolvedValue(makeMembership('property_manager_admin'));

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0].passCode).toBe('SECRET-ABC-123');
  });
});
