/**
 * Unit tests — `GET /api/v1/payments/statement` (A1 drain #133).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
  listActorUnitIdsForFinanceMock,
  buildUnitStatementMock,
  buildCommunityStatementMock,
  resolveStatementDateRangeMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
  listActorUnitIdsForFinanceMock: vi.fn(),
  buildUnitStatementMock: vi.fn(),
  buildCommunityStatementMock: vi.fn(),
  resolveStatementDateRangeMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
}));

vi.mock('@/lib/finance/common', () => ({
  parsePositiveInt: (raw: string, label: string) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid ${label}`);
    return n;
  },
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceReadPermission: requireFinanceReadPermissionMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  listActorUnitIdsForFinance: listActorUnitIdsForFinanceMock,
  buildUnitStatement: buildUnitStatementMock,
  buildCommunityStatement: buildCommunityStatementMock,
  resolveStatementDateRange: resolveStatementDateRangeMock,
}));

import { GET } from '../../src/app/api/v1/payments/statement/route';

const OWNER_MEMBERSHIP = {
  userId: 'owner-1',
  communityId: 10,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

const STAFF_MEMBERSHIP = {
  userId: 'staff-1',
  communityId: 10,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

function getReq(query = 'communityId=10'): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/payments/statement?${query}`);
}

describe('GET /api/v1/payments/statement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    parseCommunityIdFromQueryMock.mockReturnValue(10);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    resolveStatementDateRangeMock.mockReturnValue({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
    });
    buildUnitStatementMock.mockResolvedValue({ rows: [] });
    buildCommunityStatementMock.mockResolvedValue({ rows: [], totalCents: 0 });
  });

  it('returns unit mode for single-unit owner without unitId', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([42]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.mode).toBe('unit');
    expect(buildUnitStatementMock).toHaveBeenCalledWith(10, 42, expect.any(Date), expect.any(Date));
  });

  it('returns 400 when multi-unit owner omits unitId', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([1, 2]);

    const res = await GET(getReq());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('BAD_REQUEST');
  });

  it('returns community mode for staff without unitId', async () => {
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.mode).toBe('community');
    expect(buildCommunityStatementMock).toHaveBeenCalled();
    expect(requireFinanceReadPermissionMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
  });

  it('returns 403 when owner requests another unit', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([42]);

    const res = await GET(getReq('communityId=10&unitId=99'));
    expect(res.status).toBe(403);
  });
});
