import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { AppError } from '../../src/lib/api/errors/AppError';

// Mirrors pm-site-domain.test.ts — same gate mocks, new service mock.
const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireRoleMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  checkPurchasableDomainMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn((_: unknown, id: number) => id),
  requireRoleMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  requirePlanFeatureMock: vi.fn().mockResolvedValue(undefined),
  checkPurchasableDomainMock: vi.fn(),
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
vi.mock('@/lib/api/role-guard', () => ({
  requireRole: requireRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));
vi.mock('@/lib/services/custom-domain-service', () => ({
  checkPurchasableDomain: checkPurchasableDomainMock,
}));

import { GET } from '../../src/app/api/v1/pm/site/domain/check/route';

const PM_MEMBERSHIP = { role: 'pm_admin', communityId: 1 };

function getReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/pm/site/domain/check?${query}`);
}

describe('GET /api/v1/pm/site/domain/check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(PM_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_: unknown, id: number) => id);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    checkPurchasableDomainMock.mockResolvedValue({
      name: 'foo.com',
      available: true,
      price: 12,
      period: 1,
    });
  });

  it('200s with the availability result', async () => {
    const res = await GET(getReq('communityId=1&name=foo.com'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { name: 'foo.com', available: true, price: 12, period: 1 },
    });
    expect(checkPurchasableDomainMock).toHaveBeenCalledWith('foo.com');
  });

  it('runs the full sibling gate — including assertNotDemoGrace and hasSiteCustomDomain', async () => {
    await GET(getReq('communityId=1&name=foo.com'));
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(1);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(1, 'hasSiteCustomDomain');
    expect(requireRoleMock).toHaveBeenCalled();
  });

  it('400s when name is missing', async () => {
    const res = await GET(getReq('communityId=1'));
    expect(res.status).toBe(400);
    expect(checkPurchasableDomainMock).not.toHaveBeenCalled();
  });

  it('400s when name is too short', async () => {
    const res = await GET(getReq('communityId=1&name=ab'));
    expect(res.status).toBe(400);
    expect(checkPurchasableDomainMock).not.toHaveBeenCalled();
  });

  it('401s when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError('Unauthorized'));
    const res = await GET(getReq('communityId=1&name=foo.com'));
    expect(res.status).toBe(401);
    expect(checkPurchasableDomainMock).not.toHaveBeenCalled();
  });

  it('403s when the role guard rejects', async () => {
    requireRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only property managers can manage the custom domain');
    });
    const res = await GET(getReq('communityId=1&name=foo.com'));
    expect(res.status).toBe(403);
    expect(checkPurchasableDomainMock).not.toHaveBeenCalled();
  });

  it('403s for demo-grace tenants', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo communities cannot do this'));
    const res = await GET(getReq('communityId=1&name=foo.com'));
    expect(res.status).toBe(403);
    expect(checkPurchasableDomainMock).not.toHaveBeenCalled();
  });

  it('surfaces the service 429 (provider rate limit) as-is', async () => {
    checkPurchasableDomainMock.mockRejectedValueOnce(
      new AppError('Too many domain checks right now — try again in a minute.', 429, 'DOMAIN_CHECK_RATE_LIMITED'),
    );
    const res = await GET(getReq('communityId=1&name=foo.com'));
    expect(res.status).toBe(429);
  });

  it('surfaces the service 503 when provisioning is unconfigured', async () => {
    checkPurchasableDomainMock.mockRejectedValueOnce(
      new AppError('Custom-domain provisioning is not configured.', 503, 'DOMAIN_PROVISIONING_UNAVAILABLE'),
    );
    const res = await GET(getReq('communityId=1&name=foo.com'));
    expect(res.status).toBe(503);
  });
});
