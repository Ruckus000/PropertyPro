/**
 * Tests that the visitors GET endpoint strips `passCode` from responses
 * when the caller has a resident role, while preserving it for staff roles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const FULL_PERMISSIONS = {
  resources: {
    documents: { read: true, write: true },
    meetings: { read: true, write: true },
    announcements: { read: true, write: true },
    compliance: { read: true, write: true },
    residents: { read: true, write: true },
    financial: { read: true, write: true },
    maintenance: { read: true, write: true },
    violations: { read: true, write: true },
    leases: { read: true, write: true },
    contracts: { read: true, write: true },
    polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true },
  },
};

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
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
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

describe('visitors GET — passCode field stripping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    listVisitorsForCommunityMock.mockResolvedValue(MOCK_VISITORS);
    requireActorUnitIdsMock.mockResolvedValue([10]);
  });

  it('strips passCode from response for tenant role', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident', communityId: 1, userId: 'user-1', communityType: 'apartment',
      isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant',
    });

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
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident', communityId: 1, userId: 'user-1', communityType: 'apartment',
      isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    for (const visitor of json.data) {
      expect(visitor).not.toHaveProperty('passCode');
    }
  });

  it('preserves passCode for manager role (not a resident role)', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager', communityId: 1, userId: 'user-1', communityType: 'apartment',
      isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member',
      permissions: FULL_PERMISSIONS,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    // manager is not 'resident', so passCode is preserved
    expect(json.data[0].passCode).toBe('SECRET-ABC-123');
  });

  it('preserves passCode in response for cam (staff) role', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager', communityId: 1, userId: 'user-1', communityType: 'apartment',
      isAdmin: true, isUnitOwner: false, displayTitle: 'Community Manager', presetKey: 'cam',
      permissions: FULL_PERMISSIONS,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].passCode).toBe('SECRET-ABC-123');
    expect(json.data[1].passCode).toBe('SECRET-XYZ-789');
  });

  it('preserves passCode in response for site_manager role', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager', communityId: 1, userId: 'user-1', communityType: 'apartment',
      isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager',
      permissions: FULL_PERMISSIONS,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0].passCode).toBe('SECRET-ABC-123');
  });

  it('preserves passCode in response for property_manager_admin role', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'pm_admin', communityId: 1, userId: 'user-1', communityType: 'apartment',
      isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager Admin',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/visitors?communityId=1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0].passCode).toBe('SECRET-ABC-123');
  });
});
