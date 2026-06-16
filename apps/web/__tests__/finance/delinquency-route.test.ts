import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
  listDelinquentUnitsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
  listDelinquentUnitsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/common', () => {
  return {
    parsePositiveInt: (value: string, label: string) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new BadRequestError(`${label} must be a positive integer`);
      }
      return parsed;
    },
    requireFinanceEnabled: requireFinanceEnabledMock,
    requireFinanceReadPermission: requireFinanceReadPermissionMock,
  };
});

vi.mock('@/lib/services/finance-service', () => ({
  listDelinquentUnits: listDelinquentUnitsMock,
}));

import { GET } from '../../src/app/api/v1/delinquency/route';

const MANAGER_MEMBERSHIP = {
  userId: 'mgr-1',
  communityId: 42,
  role: 'manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Manager',
  communityType: 'condo_718' as const,
};

const DELINQUENCY_ROWS = [
  {
    unitId: 7,
    overdueAmountCents: 12500,
    daysOverdue: 95,
    lineItemCount: 2,
    lienEligible: true,
  },
];

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

interface ErrorJson {
  error: { code: string; message: string };
}

describe('GET /api/v1/delinquency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('mgr-1');
    requireCommunityMembershipMock.mockResolvedValue(MANAGER_MEMBERSHIP);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceReadPermissionMock.mockImplementation(() => undefined);
    listDelinquentUnitsMock.mockResolvedValue(DELINQUENCY_ROWS);
  });

  it('returns delinquency report with default lien threshold of 90', async () => {
    const res = await GET(buildReq('http://localhost/api/v1/delinquency?communityId=42'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { data: typeof DELINQUENCY_ROWS; meta: { lienThresholdDays: number } };
    };
    expect(json.data.data).toEqual(DELINQUENCY_ROWS);
    expect(json.data.meta).toEqual({ lienThresholdDays: 90 });
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'mgr-1');
    expect(listDelinquentUnitsMock).toHaveBeenCalledWith(42, 90);
  });

  it('uses explicit lienThresholdDays query parameter', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/delinquency?communityId=42&lienThresholdDays=120'),
    );

    expect(res.status).toBe(200);
    expect(listDelinquentUnitsMock).toHaveBeenCalledWith(42, 120);
    const json = (await res.json()) as {
      data: { meta: { lienThresholdDays: number } };
    };
    expect(json.data.meta.lienThresholdDays).toBe(120);
  });

  it('allows a v3 property_manager (role-v3 lockout regression guard)', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      ...MANAGER_MEMBERSHIP,
      role: 'property_manager' as const,
    });

    const res = await GET(buildReq('http://localhost/api/v1/delinquency?communityId=42'));

    expect(res.status).toBe(200);
    expect(listDelinquentUnitsMock).toHaveBeenCalledWith(42, 90);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(buildReq('http://localhost/api/v1/delinquency?communityId=42'));

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listDelinquentUnitsMock).not.toHaveBeenCalled();
  });

  it('returns 400 BAD_REQUEST when communityId query parameter is missing', async () => {
    const res = await GET(buildReq('http://localhost/api/v1/delinquency'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(json.error.message).toBe('communityId query parameter is required');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listDelinquentUnitsMock).not.toHaveBeenCalled();
  });

  it('returns 400 BAD_REQUEST when lienThresholdDays is not a positive integer', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/delinquency?communityId=42&lienThresholdDays=abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(json.error.message).toBe('lienThresholdDays must be a positive integer');
    expect(listDelinquentUnitsMock).not.toHaveBeenCalled();
  });

  it('returns 403 with byte-identical role-gate message for non finance staff', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      ...MANAGER_MEMBERSHIP,
      role: 'resident' as const,
      isAdmin: false,
    });

    const res = await GET(buildReq('http://localhost/api/v1/delinquency?communityId=42'));

    expect(res.status).toBe(403);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.message).toBe('Only community finance staff can access delinquency reporting');
    expect(listDelinquentUnitsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance read permission is denied before staff-role gate', async () => {
    requireFinanceReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await GET(buildReq('http://localhost/api/v1/delinquency?communityId=42'));

    expect(res.status).toBe(403);
    expect(listDelinquentUnitsMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header does not match communityId query', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/delinquency?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listDelinquentUnitsMock).not.toHaveBeenCalled();
  });
});
