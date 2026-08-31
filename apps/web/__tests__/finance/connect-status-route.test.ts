/**
 * Route unit test — `GET /api/v1/stripe/connect/status`.
 *
 * Added alongside the Plan A1 drain (drain #23). Mirrors drain #20
 * (`esign/my-pending`) query-only shape, with three extra gates beyond
 * plain membership: `requireFinanceEnabled`, `requireFinanceReadPermission`,
 * and a CONNECT_STATUS_ROLES role check.
 *
 * Pre-existing coverage in `finance-mutation-routes.test.ts` (lines ~471-501)
 * stays intact — that file exercises the happy + role-gate paths against the
 * real `@/lib/finance/common` and `@/lib/api/tenant-context` modules. This
 * file is FOCUSED unit coverage that mocks every collaborator, matching the
 * drain #20 pattern.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
  getConnectStatusMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
  getConnectStatusMock: vi.fn(),
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

vi.mock('@/lib/finance/common', () => ({
  requirePaymentsEnabled: vi.fn(),
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceReadPermission: requireFinanceReadPermissionMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  getConnectStatus: getConnectStatusMock,
}));

import { GET } from '../../src/app/api/v1/stripe/connect/status/route';

const baseUrl = 'http://localhost:3000/api/v1/stripe/connect/status';

describe('GET /api/v1/stripe/connect/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-finance-1');
    resolveEffectiveCommunityIdMock.mockImplementation(
      (_req: unknown, communityId: number) => communityId,
    );
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-finance-1',
      communityId: 42,
      role: 'property_manager',
      isAdmin: true,
      communityType: 'condo_718',
    });
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceReadPermissionMock.mockReturnValue(undefined);
  });

  it('returns connect status wrapped in the canonical { data } envelope', async () => {
    const status = {
      connected: true,
      accountId: 'acct_test_123',
      payoutsEnabled: true,
      chargesEnabled: true,
    };
    getConnectStatusMock.mockResolvedValue(status);

    const req = new NextRequest(`${baseUrl}?communityId=42`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(req, 42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-finance-1');
    expect(requireFinanceEnabledMock).toHaveBeenCalledTimes(1);
    expect(requireFinanceReadPermissionMock).toHaveBeenCalledTimes(1);
    expect(getConnectStatusMock).toHaveBeenCalledWith(42);
    await expect(res.json()).resolves.toEqual({ data: status });
  });

  it('returns 401 when the user is not authenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Not authenticated'),
    );

    const req = new NextRequest(`${baseUrl}?communityId=42`);
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireFinanceEnabledMock).not.toHaveBeenCalled();
    expect(requireFinanceReadPermissionMock).not.toHaveBeenCalled();
    expect(getConnectStatusMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId query parameter is missing', async () => {
    const req = new NextRequest(baseUrl);
    const res = await GET(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(getConnectStatusMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const req = new NextRequest(`${baseUrl}?communityId=abc`);
    const res = await GET(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(getConnectStatusMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a member of the requested community', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const req = new NextRequest(`${baseUrl}?communityId=42`);
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(requireFinanceEnabledMock).not.toHaveBeenCalled();
    expect(requireFinanceReadPermissionMock).not.toHaveBeenCalled();
    expect(getConnectStatusMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the finance feature is not enabled for the plan', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireFinanceEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Finance feature not enabled for this plan'),
    );

    const req = new NextRequest(`${baseUrl}?communityId=42`);
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(requireFinanceReadPermissionMock).not.toHaveBeenCalled();
    expect(getConnectStatusMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the finance read permission gate denies', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireFinanceReadPermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Missing finances:read permission');
    });

    const req = new NextRequest(`${baseUrl}?communityId=42`);
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(getConnectStatusMock).not.toHaveBeenCalled();
  });

  it('returns 403 with the canonical message when role is outside CONNECT_STATUS_ROLES', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-finance-1',
      communityId: 42,
      role: 'resident',
      isAdmin: false,
      communityType: 'condo_718',
    });

    const req = new NextRequest(`${baseUrl}?communityId=42`);
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe(
      'Only community finance staff can view Stripe Connect status',
    );
    expect(getConnectStatusMock).not.toHaveBeenCalled();
  });
});
