import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  unitsTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  unitsTableMock: { id: Symbol('units.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  units: unitsTableMock,
  userRoles: { id: Symbol('user_roles.id') },
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

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH } from '../../src/app/api/v1/units/route';

function makeScopedClient() {
  const query = vi.fn().mockImplementation(async (table: unknown) => {
    if (table === unitsTableMock) {
      return [{ id: 10, communityId: 42, unitNumber: '101', rentAmount: '1500.00' }];
    }
    return [];
  });

  return {
    query,
    update: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue([]),
    softDelete: vi.fn().mockResolvedValue([]),
    hardDelete: vi.fn().mockResolvedValue([]),
  };
}

describe('units rent write-path constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'manager',
      communityType: 'apartment',
      isAdmin: true,
      isUnitOwner: false,
      displayTitle: 'Site Manager',
      presetKey: 'site_manager',
      permissions: { resources: { units: { read: true, write: true } } },
    });
    createScopedClientMock.mockReturnValue(makeScopedClient());
  });

  it('rejects direct unit rentAmount updates for apartment communities', async () => {
    const scoped = makeScopedClient();
    createScopedClientMock.mockReturnValue(scoped);

    const req = new NextRequest('http://localhost:3000/api/v1/units', {
      method: 'PATCH',
      body: JSON.stringify({
        communityId: 42,
        unitId: 10,
        rentAmount: '1800.00',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain('Update lease rentAmount via /api/v1/leases');
  });

  it('rejects rentAmount updates for non-apartment communities', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'board_member',
      communityType: 'condo_718',
      isAdmin: true,
      isUnitOwner: true,
      displayTitle: 'Board Member',
      presetKey: 'board_member',
      permissions: { resources: { units: { read: true, write: true } } },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/units', {
      method: 'PATCH',
      body: JSON.stringify({
        communityId: 42,
        unitId: 10,
        rentAmount: '1800.00',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain('only available for apartment communities');
  });
});
