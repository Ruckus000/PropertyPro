/**
 * Unit tests — `/api/v1/units` (A1 drain #136).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { ValidationError } from '../../src/lib/api/errors/ValidationError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionForMutationMock,
  createScopedClientMock,
  logAuditEventMock,
  listUnitsForCommunityMock,
  getUnitByNumberMock,
  createUnitForCommunityMock,
  tryAutoCompleteMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  listUnitsForCommunityMock: vi.fn(),
  getUnitByNumberMock: vi.fn(),
  createUnitForCommunityMock: vi.fn(),
  tryAutoCompleteMock: vi.fn(),
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

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/services/unit-service', () => ({
  listUnitsForCommunity: listUnitsForCommunityMock,
  getUnitByNumber: getUnitByNumberMock,
  createUnitForCommunity: createUnitForCommunityMock,
  getUnitById: vi.fn(),
  listResidentRolesForUnit: vi.fn(),
  softDeleteUnitById: vi.fn(),
  updateUnitById: vi.fn(),
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));

import { GET, POST } from '../../src/app/api/v1/units/route';

const MEMBERSHIP = {
  userId: 'actor-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

const SCOPED = { communityId: 42 };

describe('/api/v1/units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePermissionMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    createScopedClientMock.mockReturnValue(SCOPED);
    logAuditEventMock.mockResolvedValue(undefined);
    tryAutoCompleteMock.mockResolvedValue(undefined);
  });

  it('GET lists units for community', async () => {
    listUnitsForCommunityMock.mockResolvedValue([
      {
        id: 1,
        communityId: 42,
        unitNumber: '101',
        building: null,
        floor: 1,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 900,
        rentAmount: null,
        ownerUserId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/units?communityId=42'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].unitNumber).toBe('101');
    expect(listUnitsForCommunityMock).toHaveBeenCalledWith(SCOPED);
  });

  it('GET returns 403 when units.read denied', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Permission denied');
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/units?communityId=42'));
    expect(res.status).toBe(403);
  });

  describe('GET redacts manager-only fields for non-managers', () => {
    const UNIT_ROWS = [
      {
        id: 1,
        communityId: 42,
        unitNumber: '101',
        building: null,
        floor: 1,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 900,
        rentAmount: '1850.00',
        ownerUserId: 'owner-101',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        communityId: 42,
        unitNumber: '102',
        building: null,
        floor: 1,
        bedrooms: 1,
        bathrooms: 1,
        sqft: 650,
        rentAmount: '1400.00',
        ownerUserId: 'owner-102',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    async function listAs(role: string, isUnitOwner: boolean) {
      requireCommunityMembershipMock.mockResolvedValue({
        ...MEMBERSHIP,
        role,
        isUnitOwner,
        isAdmin: role === 'property_manager' || role === 'root_manager',
      });
      listUnitsForCommunityMock.mockResolvedValue(UNIT_ROWS);
      const res = await GET(new NextRequest('http://localhost:3000/api/v1/units?communityId=42'));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: Array<Record<string, unknown>> };
      return json.data;
    }

    it.each([
      ['tenant', 'resident', false],
      ['owner', 'resident', true],
    ] as const)('%s: every unit has rentAmount and ownerUserId nulled', async (_label, role, isUnitOwner) => {
      const units = await listAs(role, isUnitOwner);
      expect(units).toHaveLength(2);
      for (const unit of units) {
        expect(unit['rentAmount']).toBeNull();
        expect(unit['ownerUserId']).toBeNull();
      }
      // Non-sensitive fields still flow — the unit picker keeps working.
      expect(units.map((u) => u['unitNumber'])).toEqual(['101', '102']);
      expect(units[0]!['bedrooms']).toBe(2);
    });

    it.each(['property_manager', 'root_manager'] as const)(
      '%s: rentAmount and ownerUserId are returned',
      async (role) => {
        const units = await listAs(role, false);
        expect(units.map((u) => u['rentAmount'])).toEqual(['1850.00', '1400.00']);
        expect(units.map((u) => u['ownerUserId'])).toEqual(['owner-101', 'owner-102']);
      },
    );
  });

  it('POST creates unit and logs audit', async () => {
    getUnitByNumberMock.mockResolvedValue(null);
    createUnitForCommunityMock.mockResolvedValue({
      id: 9,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/units', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          unitNumber: '202',
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.unitNumber).toBe('202');
    expect(logAuditEventMock).toHaveBeenCalled();
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(42, 'actor-1', 'add_units');
  });

  it('POST rejects duplicate unit number', async () => {
    getUnitByNumberMock.mockResolvedValue({ id: 5 });

    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/units', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          unitNumber: '202',
        }),
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
