/**
 * Unit tests — `/api/v1/payments/past-due-rule` (Directory past-due definition).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
  requireFinanceAdminWriteMock,
  assertNotDemoGraceMock,
  getPastDueRuleMock,
  setPastDueRuleMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
  requireFinanceAdminWriteMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getPastDueRuleMock: vi.fn(),
  setPastDueRuleMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireCommunityMembershipMock }));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: (_req: unknown, id: number) => id,
}));
vi.mock('@/lib/finance/common', () => ({
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceReadPermission: requireFinanceReadPermissionMock,
  requireFinanceAdminWrite: requireFinanceAdminWriteMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@/lib/services/community-settings-service', () => ({
  getPastDueRule: getPastDueRuleMock,
  setPastDueRule: setPastDueRuleMock,
}));
vi.mock('@propertypro/db', () => ({ logAuditEvent: logAuditEventMock }));

import { GET, PATCH } from '../../src/app/api/v1/payments/past-due-rule/route';

const get = () => GET(new NextRequest('http://localhost:3000/api/v1/payments/past-due-rule?communityId=42'));
const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest('http://localhost:3000/api/v1/payments/past-due-rule', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
      body: JSON.stringify({ communityId: 42, ...body }),
    }),
  );

describe('/api/v1/payments/past-due-rule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    requireCommunityMembershipMock.mockResolvedValue({ communityId: 42, role: 'property_manager', isAdmin: true });
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceReadPermissionMock.mockReturnValue(undefined);
    requireFinanceAdminWriteMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    getPastDueRuleMock.mockResolvedValue({ minCents: 0, minDays: 0 });
    setPastDueRuleMock.mockResolvedValue({ minCents: 0, minDays: 0 });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('GET returns the stored rule', async () => {
    getPastDueRuleMock.mockResolvedValue({ minCents: 50_000, minDays: 30 });
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ minCents: 50_000, minDays: 30 });
    expect(getPastDueRuleMock).toHaveBeenCalledWith(42);
  });

  it('GET is refused without finance read', async () => {
    requireFinanceReadPermissionMock.mockImplementation(() => {
      throw new ForbiddenError('no');
    });
    expect((await get()).status).toBe(403);
  });

  it('PATCH saves the rule and audits old → new', async () => {
    const res = await patch({ minCents: 25_000, minDays: 60 });
    expect(res.status).toBe(200);
    expect(setPastDueRuleMock).toHaveBeenCalledWith(42, { minCents: 25_000, minDays: 60 });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings_changed',
        oldValues: { pastDueMinCents: 0, pastDueMinDays: 0 },
        newValues: { pastDueMinCents: 25_000, pastDueMinDays: 60 },
        metadata: { requestId: 'req-1' },
      }),
    );
  });

  it('PATCH is refused for non-finance-admins and writes nothing', async () => {
    requireFinanceAdminWriteMock.mockImplementation(() => {
      throw new ForbiddenError('no');
    });
    expect((await patch({ minCents: 1, minDays: 1 })).status).toBe(403);
    expect(setPastDueRuleMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ minCents: -1, minDays: 0 }],
    [{ minCents: 0, minDays: 1.5 }],
    [{ minCents: 0 }],
  ])('PATCH rejects %j', async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(setPastDueRuleMock).not.toHaveBeenCalled();
  });
});
