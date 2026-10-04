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
  getUnitByIdMock,
  updateUnitByIdMock,
  listResidentRolesForUnitMock,
  softDeleteUnitByIdMock,
  getUnitBalanceCentsMock,
  countOpenViolationsForUnitMock,
  countOpenViolationsByUnitMock,
  requireViolationsEnabledMock,
  countOccupantsForUnitMock,
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
  getUnitByIdMock: vi.fn(),
  updateUnitByIdMock: vi.fn(),
  listResidentRolesForUnitMock: vi.fn(),
  softDeleteUnitByIdMock: vi.fn(),
  getUnitBalanceCentsMock: vi.fn(),
  countOpenViolationsForUnitMock: vi.fn(),
  countOpenViolationsByUnitMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  countOccupantsForUnitMock: vi.fn(),
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

vi.mock('@/lib/services/unit-service', async (importOriginal) => ({
  // Real `unitNumberTaken` (the 409 it builds is under test); data access mocked.
  ...(await importOriginal<typeof import('../../src/lib/services/unit-service')>()),
  listUnitsForCommunity: listUnitsForCommunityMock,
  getUnitByNumber: getUnitByNumberMock,
  createUnitForCommunity: createUnitForCommunityMock,
  getUnitById: getUnitByIdMock,
  listResidentRolesForUnit: listResidentRolesForUnitMock,
  softDeleteUnitById: softDeleteUnitByIdMock,
  updateUnitById: updateUnitByIdMock,
  getUnitBalanceCents: getUnitBalanceCentsMock,
  countOpenViolationsForUnit: countOpenViolationsForUnitMock,
  countOpenViolationsByUnit: countOpenViolationsByUnitMock,
}));

vi.mock('@/lib/violations/common', () => ({ requireViolationsEnabled: requireViolationsEnabledMock }));

vi.mock('@/lib/services/occupant-service', () => ({ countOccupantsForUnit: countOccupantsForUnitMock }));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));

import { DELETE, GET, PATCH, POST } from '../../src/app/api/v1/units/route';

const MEMBERSHIP = {
  userId: 'actor-1',
  communityId: 42,
  // A v3 management role: GET redacts rentAmount/ownerUserId unless
  // isAdminRole(role), and a retired name resolves to non-admin.
  role: 'property_manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Property Manager',
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
    requireViolationsEnabledMock.mockResolvedValue(undefined);
    countOpenViolationsByUnitMock.mockResolvedValue(new Map());
    countOccupantsForUnitMock.mockResolvedValue(0);
  });

  describe('GET open-violation counts', () => {
    const ROWS = [
      { id: 1, communityId: 42, unitNumber: '101', createdAt: '', updatedAt: '' },
      { id: 2, communityId: 42, unitNumber: '102', createdAt: '', updatedAt: '' },
    ];
    const list = async () => {
      listUnitsForCommunityMock.mockResolvedValue(ROWS);
      const res = await GET(new NextRequest('http://localhost:3000/api/v1/units?communityId=42'));
      return ((await res.json()) as { data: Array<{ openViolations: number | null }> }).data;
    };

    it('managers get a count per unit, from one community-wide query (0 where none)', async () => {
      countOpenViolationsByUnitMock.mockResolvedValue(new Map([[2, 3]]));
      expect((await list()).map((u) => u.openViolations)).toEqual([0, 3]);
      expect(countOpenViolationsByUnitMock).toHaveBeenCalledTimes(1);
    });

    it('null, and not queried, when violations are off for the community', async () => {
      requireViolationsEnabledMock.mockRejectedValue(new ForbiddenError('off'));
      expect((await list()).map((u) => u.openViolations)).toEqual([null, null]);
      expect(countOpenViolationsByUnitMock).not.toHaveBeenCalled();
    });

    it('null, and not queried, for residents — a neighbour\'s enforcement history is not theirs', async () => {
      requireCommunityMembershipMock.mockResolvedValue({ ...MEMBERSHIP, role: 'resident', isAdmin: false, isUnitOwner: true });
      expect((await list()).map((u) => u.openViolations)).toEqual([null, null]);
      expect(countOpenViolationsByUnitMock).not.toHaveBeenCalled();
    });
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
        offlineReason: 'storm_damage',
        offlineNote: 'Roof leak',
        offlineSince: '2026-09-01',
        offlineUntil: null,
        occupancy: 'vacant',
        occupancyConfirmedAt: null,
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
        occupancy: 'rented',
        occupancyConfirmedAt: '2026-09-01T00:00:00.000Z',
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
        expect(unit['occupancy']).toBeNull();
        expect(unit['occupancyConfirmed']).toBe(false);
        // Leases v3: why a unit is offline is manager-internal.
        expect(unit['offlineReason']).toBeNull();
        expect(unit['offlineNote']).toBeNull();
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
        expect(units.map((u) => u['offlineSince'])).toEqual(['2026-09-01', null]);
        expect(units[0]!['offlineNote']).toBe('Roof leak');
        expect(units.map((u) => u['occupancy'])).toEqual(['vacant', 'rented']);
        // Backfilled guess (confirmedAt null) vs. a manager-confirmed value.
        expect(units.map((u) => u['occupancyConfirmed'])).toEqual([false, true]);
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

    // A duplicate is a conflict with existing state, not a malformed request.
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('CONFLICT');
    expect(json.error.message).toBe('Unit number "202" already exists in this community');
  });

  describe('optimistic concurrency (expectedUpdatedAt)', () => {
    function patchUnit(body: Record<string, unknown>) {
      return PATCH(
        new NextRequest('http://localhost:3000/api/v1/units', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId: 42, unitId: 7, ...body }),
        }),
      );
    }

    beforeEach(() => {
      getUnitByIdMock.mockResolvedValue({ id: 7, unitNumber: '101', floor: 1, occupancy: null });
      getUnitByNumberMock.mockResolvedValue(null);
    });

    it('passes the token to the conditional update and returns the new updatedAt', async () => {
      updateUnitByIdMock.mockResolvedValue({ id: 7, updatedAt: '2026-10-02T15:00:00.123Z' });
      const res = await patchUnit({ floor: 2, expectedUpdatedAt: '2026-10-01T09:00:00.456Z' });
      expect(res.status).toBe(200);
      expect(updateUnitByIdMock.mock.calls[0]![3]).toBe('2026-10-01T09:00:00.456Z');
      expect((await res.json()).data.updatedAt).toBe('2026-10-02T15:00:00.123Z');
    });

    it('a stale token (someone saved in between) is a 409 and nothing is audited', async () => {
      updateUnitByIdMock.mockResolvedValue(null);
      const res = await patchUnit({ floor: 2, expectedUpdatedAt: '2026-10-01T09:00:00.456Z' });
      expect(res.status).toBe(409);
      expect((await res.json()).error.message).toMatch(/someone else changed this unit/i);
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });

    it('rejects a token that is not a timestamp', async () => {
      const res = await patchUnit({ floor: 2, expectedUpdatedAt: 'yesterday' });
      expect(res.status).toBe(400);
      expect(updateUnitByIdMock).not.toHaveBeenCalled();
    });
  });

  describe('occupancy (migration unit_occupancy)', () => {
    function postUnit(body: Record<string, unknown>) {
      return POST(
        new NextRequest('http://localhost:3000/api/v1/units', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId: 42, unitNumber: '303', ...body }),
        }),
      );
    }

    function patchUnit(body: Record<string, unknown>) {
      return PATCH(
        new NextRequest('http://localhost:3000/api/v1/units', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId: 42, unitId: 7, ...body }),
        }),
      );
    }

    beforeEach(() => {
      getUnitByNumberMock.mockResolvedValue(null);
      createUnitForCommunityMock.mockResolvedValue({
        id: 9,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
      getUnitByIdMock.mockResolvedValue({
        id: 7,
        unitNumber: '7',
        occupancy: 'vacant',
        occupancyConfirmedAt: null,
      });
      updateUnitByIdMock.mockResolvedValue({ id: 7, updatedAt: '2026-01-02T00:00:00.000Z' });
    });

    it('POST with occupancy stores it as confirmed', async () => {
      const res = await postUnit({ occupancy: 'rented' });
      expect(res.status).toBe(200);
      const values = createUnitForCommunityMock.mock.calls[0]![1] as Record<string, unknown>;
      expect(values['occupancy']).toBe('rented');
      expect(values['occupancyConfirmedAt']).toBeInstanceOf(Date);
      const json = await res.json();
      expect(json.data.occupancyConfirmed).toBe(true);
    });

    it('POST without occupancy leaves it unknown and unconfirmed', async () => {
      await postUnit({});
      const values = createUnitForCommunityMock.mock.calls[0]![1] as Record<string, unknown>;
      expect(values['occupancy']).toBeNull();
      expect(values['occupancyConfirmedAt']).toBeNull();
    });

    it('POST rejects an unknown occupancy value', async () => {
      const res = await postUnit({ occupancy: 'snowbird' });
      expect(res.status).toBe(400);
      expect(createUnitForCommunityMock).not.toHaveBeenCalled();
    });

    it.each([
      ['POST', () => postUnit({ occupancy: 'owner_occupied' })],
      ['PATCH', () => patchUnit({ occupancy: 'owner_occupied' })],
    ] as const)('%s rejects owner_occupied in an apartment community', async (_verb, send) => {
      requireCommunityMembershipMock.mockResolvedValue({ ...MEMBERSHIP, communityType: 'apartment' });
      const res = await send();
      expect(res.status).toBe(400);
      expect(createUnitForCommunityMock).not.toHaveBeenCalled();
      expect(updateUnitByIdMock).not.toHaveBeenCalled();
    });

    it('PATCH re-saving the backfilled value confirms it and audits the write', async () => {
      const res = await patchUnit({ occupancy: 'vacant' });
      expect(res.status).toBe(200);
      const update = updateUnitByIdMock.mock.calls[0]![2] as Record<string, unknown>;
      expect(update['occupancy']).toBe('vacant');
      expect(update['occupancyConfirmedAt']).toBeInstanceOf(Date);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: { occupancy: 'vacant' },
          newValues: { occupancy: 'vacant' },
        }),
      );
      const json = await res.json();
      expect(json.data.occupancyConfirmed).toBe(true);
    });

    it('PATCH clearing occupancy un-confirms it', async () => {
      await patchUnit({ occupancy: null });
      const update = updateUnitByIdMock.mock.calls[0]![2] as Record<string, unknown>;
      expect(update['occupancy']).toBeNull();
      expect(update['occupancyConfirmedAt']).toBeNull();
    });

    it('PATCH without occupancy does not touch confirmation', async () => {
      await patchUnit({ floor: 3 });
      const update = updateUnitByIdMock.mock.calls[0]![2] as Record<string, unknown>;
      expect(update).not.toHaveProperty('occupancyConfirmedAt');
    });
  });

  describe('DELETE guards: money and enforcement history', () => {
    function deleteUnit() {
      return DELETE(
        new NextRequest('http://localhost:3000/api/v1/units', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId: 42, unitId: 7 }),
        }),
      );
    }

    beforeEach(() => {
      getUnitByIdMock.mockResolvedValue({ id: 7, unitNumber: '7', building: null, floor: 1 });
      listResidentRolesForUnitMock.mockResolvedValue([]);
      getUnitBalanceCentsMock.mockResolvedValue(0);
      countOpenViolationsForUnitMock.mockResolvedValue(0);
    });

    it.each([
      ['an amount owed', 12_500],
      ['a credit owed back', -4_000],
    ])('refuses with %s on the ledger', async (_label, cents) => {
      getUnitBalanceCentsMock.mockResolvedValue(cents);
      const res = await deleteUnit();
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toMatch(/balance is not zero/);
      expect(softDeleteUnitByIdMock).not.toHaveBeenCalled();
    });

    it('refuses with open violations', async () => {
      countOpenViolationsForUnitMock.mockResolvedValue(2);
      const res = await deleteUnit();
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toMatch(/2 open violation/);
      expect(softDeleteUnitByIdMock).not.toHaveBeenCalled();
    });

    it('refuses while household members (no login) are on file', async () => {
      countOccupantsForUnitMock.mockResolvedValue(1);
      const res = await deleteUnit();
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toMatch(/1 household member/);
      expect(softDeleteUnitByIdMock).not.toHaveBeenCalled();
    });
  });

  it('DELETE soft-deletes an empty unit and audits it', async () => {
    getUnitByIdMock.mockResolvedValue({ id: 7, unitNumber: '7', building: null, floor: 1 });
    listResidentRolesForUnitMock.mockResolvedValue([]);
    getUnitBalanceCentsMock.mockResolvedValue(0);
    countOpenViolationsForUnitMock.mockResolvedValue(0);
    softDeleteUnitByIdMock.mockResolvedValue(undefined);

    const res = await DELETE(
      new NextRequest('http://localhost:3000/api/v1/units', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42, unitId: 7 }),
      }),
    );

    expect(res.status).toBe(200);
    expect(softDeleteUnitByIdMock).toHaveBeenCalledWith(SCOPED, 7);
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete' }));
  });
});
