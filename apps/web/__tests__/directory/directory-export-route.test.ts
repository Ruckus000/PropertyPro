/**
 * GET /api/v1/directory/export — who may export what, and which columns they
 * get. The service is mocked here; its rows and audit row are proven against
 * a real database in directory-export.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const { membershipMock, buildMock, planMock, violationsMock, permissionMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  buildMock: vi.fn(),
  planMock: vi.fn(),
  violationsMock: vi.fn(),
  permissionMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: async () => 'pm-1' }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: membershipMock }));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: async () => undefined }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: planMock }));
vi.mock('@/lib/violations/common', () => ({ requireViolationsEnabled: violationsMock }));
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: vi.fn(),
  checkPermissionV2: permissionMock,
}));
vi.mock('@/lib/services/directory-export-service', () => ({ buildDirectoryExport: buildMock }));

import { GET } from '../../src/app/api/v1/directory/export/route';

const MANAGER = { role: 'property_manager', isAdmin: true, isUnitOwner: false, communityType: 'condo_718', communityId: 42 };
const OWNER = { role: 'resident', isAdmin: false, isUnitOwner: true, communityType: 'condo_718', communityId: 42 };
const UUID = '11111111-1111-4111-8111-111111111111';

const get = (query: string) => GET(new NextRequest(`http://localhost:3000/api/v1/directory/export?communityId=42&${query}`));

describe('GET /api/v1/directory/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipMock.mockResolvedValue(MANAGER);
    planMock.mockResolvedValue(undefined);
    violationsMock.mockResolvedValue(undefined);
    permissionMock.mockReturnValue(true);
    buildMock.mockResolvedValue({ csv: 'Unit\r\n101\r\n', rowCount: 1 });
  });

  it('returns the CSV as a named file for the requested kind', async () => {
    const res = await get('kind=units');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ filename: 'directory-units-42.csv', csv: 'Unit\r\n101\r\n', rowCount: 1 });
    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        kind: 'units',
        actorUserId: 'pm-1',
        access: { isAdmin: true, canSeeBalances: true, canSeeViolations: true },
      }),
    );
  });

  it('balances are left out without a finance plan; violation counts without violations on', async () => {
    planMock.mockRejectedValue(new ForbiddenError('no plan'));
    violationsMock.mockRejectedValue(new ForbiddenError('off'));
    await get('kind=units');
    expect(buildMock.mock.calls[0]![0].access).toEqual({ isAdmin: true, canSeeBalances: false, canSeeViolations: false });
  });

  it('an owner gets the units file without any manager columns', async () => {
    membershipMock.mockResolvedValue(OWNER);
    await get('kind=units');
    expect(buildMock.mock.calls[0]![0].access).toEqual({ isAdmin: false, canSeeBalances: false, canSeeViolations: false });
  });

  it('an owner cannot export residents', async () => {
    membershipMock.mockResolvedValue(OWNER);
    const res = await get('kind=residents');
    expect(res.status).toBe(403);
    expect(buildMock).not.toHaveBeenCalled();
  });

  it('passes the selection for residents, and refuses it for units or when malformed', async () => {
    await get(`kind=residents&userIds=${UUID}`);
    expect(buildMock.mock.calls[0]![0].userIds).toEqual([UUID]);
    expect((await get(`kind=units&userIds=${UUID}`)).status).toBe(400);
    expect((await get('kind=residents&userIds=not-a-uuid')).status).toBe(400);
    expect((await get('kind=everything')).status).toBe(400);
  });
});
