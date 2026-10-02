/**
 * Unit tests — `/api/v1/settings/access` (tenant access to Inspection Reports).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionMock,
  getAccessMock,
  setAccessMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionMock: vi.fn(),
  getAccessMock: vi.fn(),
  setAccessMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireCommunityMembershipMock }));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: (_req: unknown, id: number) => id,
}));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: requirePermissionMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionMock,
}));
vi.mock('@/lib/services/community-settings-service', () => ({
  getCommunityAccessSettings: getAccessMock,
  setCommunityAccessSettings: setAccessMock,
}));
vi.mock('@propertypro/db', () => ({ logAuditEvent: logAuditEventMock }));

import { GET, PATCH } from '../../src/app/api/v1/settings/access/route';

const off = { tenantsCanViewInspectionReports: false };

const get = () => GET(new NextRequest('http://localhost:3000/api/v1/settings/access?communityId=42'));
const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest('http://localhost:3000/api/v1/settings/access', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
      body: JSON.stringify({ communityId: 42, ...body }),
    }),
  );

describe('/api/v1/settings/access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    requireCommunityMembershipMock.mockResolvedValue({
      communityId: 42, role: 'property_manager', isAdmin: true, communityType: 'condo_718',
    });
    requirePermissionMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireActiveSubscriptionMock.mockResolvedValue(undefined);
    getAccessMock.mockResolvedValue(off);
    setAccessMock.mockResolvedValue(off);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('GET returns the setting and requires settings:write', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(off);
    expect(requirePermissionMock).toHaveBeenCalledWith(expect.anything(), 'settings', 'write');
  });

  it('GET is refused for a resident', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('no');
    });
    expect((await get()).status).toBe(403);
    expect(getAccessMock).not.toHaveBeenCalled();
  });

  it('PATCH saves the toggle and audits old → new', async () => {
    const res = await patch({ tenantsCanViewInspectionReports: true });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ tenantsCanViewInspectionReports: true });
    expect(setAccessMock).toHaveBeenCalledWith(42, { tenantsCanViewInspectionReports: true });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings_changed',
        resourceType: 'community',
        oldValues: off,
        newValues: { tenantsCanViewInspectionReports: true },
        metadata: { requestId: 'req-1' },
      }),
    );
  });

  it('PATCH is refused for a resident and writes nothing', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('no');
    });
    expect((await patch({ tenantsCanViewInspectionReports: true })).status).toBe(403);
    expect(setAccessMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('PATCH is refused for an apartment community', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      communityId: 42, role: 'property_manager', isAdmin: true, communityType: 'apartment',
    });
    expect((await patch({ tenantsCanViewInspectionReports: true })).status).toBe(400);
    expect(setAccessMock).not.toHaveBeenCalled();
  });

  it('PATCH refuses a lapsed subscription', async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new ForbiddenError('lapsed'));
    expect((await patch({ tenantsCanViewInspectionReports: true })).status).toBe(403);
    expect(setAccessMock).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ tenantsCanViewInspectionReports: 1 }]])('PATCH rejects %j', async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(setAccessMock).not.toHaveBeenCalled();
  });
});
